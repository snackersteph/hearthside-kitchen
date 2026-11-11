import { describe, expect, it, vi } from "vitest";
import { initialState } from "@/lib/kitchen/data";
import {
  buildInventoryTools,
  InventoryWorkspace,
  runInventoryAgent,
  type AgentToolSpec,
  type RunModel,
} from "@/lib/kitchen/inventory-agent";
import type { KitchenState } from "@/lib/kitchen/types";
import { agentScenario, reference } from "./agent-fixtures";

/** Call a tool exactly as the SDK's tool runner would: parse, then run. */
const call = (tools: AgentToolSpec[], name: string, input: unknown) => {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`no tool ${name}`);
  return JSON.parse(tool.run(tool.parse(input) as never));
};

const wellStocked = (): KitchenState => {
  const s = initialState();
  return { ...s, ingredients: s.ingredients.map((i) => ({ ...i, stock: 1000 })) };
};

const ids = (drafts: { lines: { ingredientId: string }[] }[]) =>
  drafts.flatMap((d) => d.lines.map((l) => l.ingredientId)).sort();

describe("inventory agent: rules mode (no model)", () => {
  it("handles every shortage: draft or hand to the Menu Agent", async () => {
    const { state } = agentScenario();
    const ws = new InventoryWorkspace(state, reference);
    const result = await runInventoryAgent(state, { reference });
    const handled = new Set([
      ...result.drafts.flatMap((d) => d.lines.map((l) => l.ingredientId)),
      ...result.handoffs.map((h) => h.ingredientId),
    ]);
    expect(result.mode).toBe("rules");
    expect(ws.shortages.length).toBeGreaterThan(0);
    expect([...handled].sort()).toEqual(ws.shortages.map((s) => s.ingredientId).sort());
  });

  it("only drafts orders from eligible, on-time vendors, and every draft awaits approval", async () => {
    const { state } = agentScenario();
    const result = await runInventoryAgent(state, { reference });
    expect(result.drafts.length).toBeGreaterThan(0);
    for (const draft of result.drafts) {
      expect(draft.status).toBe("draft");
      for (const line of draft.lines) {
        const sourcing = result.sourcing.find((s) => s.ingredientId === line.ingredientId);
        const option = sourcing?.options.find((o) => o.vendorId === draft.vendorId);
        expect(option?.compliance.status).toBe("eligible");
        expect(option?.onTime).toBe(true);
      }
    }
  });

  it("escalates when no vendor can deliver in time or none is compliant", async () => {
    const sc = agentScenario();
    const result = await runInventoryAgent(sc.state, { reference });
    const reason = (id: string) => result.handoffs.find((h) => h.ingredientId === id)?.reason;
    expect(reason(sc.slow.ingredientId)).toBe("too-slow");
    expect(reason(sc.unverified.ingredientId)).toBe("no-compliant-vendor");
    expect(
      result.messages.find((m) => m.id === `inv-agent-handoff-${sc.unverified.ingredientId}`),
    ).toMatchObject({ to: "menu", tone: "alert" });
    // Nothing that was escalated is also ordered.
    expect(ids(result.drafts)).not.toContain(sc.slow.ingredientId);
    expect(ids(result.drafts)).not.toContain(sc.unverified.ingredientId);
  });

  it("totals each draft from its lines", async () => {
    const { state } = agentScenario();
    const result = await runInventoryAgent(state, { reference });
    expect(result.drafts.length).toBeGreaterThan(0);
    for (const draft of result.drafts)
      expect(draft.total).toBeCloseTo(
        draft.lines.reduce((sum, l) => sum + l.total, 0),
        2,
      );
  });

  it("explains a cheaper vendor it skipped for compliance", async () => {
    const { state } = agentScenario();
    const ws = new InventoryWorkspace(state, reference);
    // Find a shortage where a cheaper vendor exists but is blocked or unverified.
    const target = ws.shortages
      .map((shortage) => {
        const sourcing = ws.source(shortage.ingredientId);
        const recommended = sourcing?.recommended;
        const skipped = sourcing?.options.find(
          (o) =>
            recommended &&
            o.vendorId !== recommended.vendorId &&
            o.total < recommended.total &&
            o.compliance.status !== "eligible",
        );
        return recommended && skipped ? { shortage, recommended, skipped } : undefined;
      })
      .find(Boolean);
    if (!target)
      throw new Error("fixture: expected a shortage with a cheaper, non-compliant vendor");

    const result = await runInventoryAgent(state, { reference });
    const message = result.messages.find(
      (m) => m.id === `inv-agent-skip-${target.shortage.ingredientId}-${target.skipped.vendorId}`,
    );
    expect(message?.text).toContain(`Skipped ${target.skipped.vendorName}`);
    expect(message?.text).toContain(target.skipped.compliance.reasons[0]!.toLowerCase());
    expect(message?.tone).toBe("alert");
    expect(
      result.drafts.some(
        (d) =>
          d.vendorId === target.skipped.vendorId &&
          d.lines.some((l) => l.ingredientId === target.shortage.ingredientId),
      ),
    ).toBe(false);
  });

  it("reports nothing to do, and never calls the model, when stock is sufficient", async () => {
    const runModel = vi.fn<RunModel>();
    const result = await runInventoryAgent(wellStocked(), { reference, runModel });
    expect(runModel).not.toHaveBeenCalled();
    expect(result.drafts).toEqual([]);
    expect(result.summary).toMatch(/no purchase requests/i);
  });
});

describe("inventory agent: tools enforce the rules", () => {
  const setup = () => {
    const sc = agentScenario();
    const ws = new InventoryWorkspace(sc.state, reference);
    return { sc, ws, tools: buildInventoryTools(ws) };
  };

  it("lists shortages with quantities and dates", () => {
    const { ws, tools } = setup();
    const list = call(tools, "list_shortages", {});
    expect(list).toHaveLength(ws.shortages.length);
    expect(list.length).toBeGreaterThan(0);
    for (const shortage of ws.shortages) {
      expect(
        list.find((s: { ingredient_id: string }) => s.ingredient_id === shortage.ingredientId),
      ).toMatchObject({
        quantity_to_order: shortage.qty,
        first_short_date: shortage.neededDate ?? null,
        status: "open",
      });
    }
  });

  it("refuses to order from an unverified vendor", () => {
    const { sc, tools } = setup();
    const result = call(tools, "add_to_draft_order", {
      ingredient_id: sc.unverified.ingredientId,
      vendor_id: "hearth-bakery",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unverified/);
  });

  it("refuses an eligible vendor that arrives after the shortage", () => {
    const { sc, tools } = setup();
    const result = call(tools, "add_to_draft_order", {
      ingredient_id: sc.slow.ingredientId,
      vendor_id: sc.slowVendorId,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain(`after the ${sc.slow.neededDate} shortage`);
  });

  it("refuses a vendor that does not supply the ingredient", () => {
    const { sc, tools } = setup();
    // Farmstead Poultry only supplies chicken and turkey.
    const result = call(tools, "add_to_draft_order", {
      ingredient_id: sc.ok.ingredientId,
      vendor_id: "farmstead-poultry",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/does not supply/);
  });

  it("refuses ingredients that are not shortages", () => {
    const { ws, tools } = setup();
    expect(
      call(tools, "add_to_draft_order", { ingredient_id: "not-an-ingredient", vendor_id: "sysco" })
        .ok,
    ).toBe(false);
    // Also an ingredient that exists but is fully covered, whichever one that is in the current seed data.
    const covered = ws.state.ingredients.find((i) => !ws.shortage(i.id));
    if (covered)
      expect(
        call(tools, "add_to_draft_order", { ingredient_id: covered.id, vendor_id: "sysco" }).ok,
      ).toBe(false);
  });

  it("accepts an eligible on-time vendor, once", () => {
    const { sc, ws, tools } = setup();
    expect(
      call(tools, "add_to_draft_order", {
        ingredient_id: sc.ok.ingredientId,
        vendor_id: sc.okVendorId,
        rationale: "Only eligible supplier that arrives in time.",
      }).ok,
    ).toBe(true);
    expect(
      call(tools, "add_to_draft_order", {
        ingredient_id: sc.ok.ingredientId,
        vendor_id: sc.okVendorId,
      }).error,
    ).toMatch(/already handled/);
    expect(ws.drafts()[0]?.lines[0]).toMatchObject({
      ingredientId: sc.ok.ingredientId,
      qty: sc.ok.qty,
    });
  });

  it("fixes quantity and price in code, ignoring anything the model adds", () => {
    const { sc, ws, tools } = setup();
    const tool = tools.find((t) => t.name === "add_to_draft_order");
    // Extra fields (quantity, price) are not part of the schema and never reach the order.
    const parsed = tool?.parse({
      ingredient_id: sc.ok.ingredientId,
      vendor_id: sc.okVendorId,
      quantity: 9999,
      price: 0.01,
    });
    tool?.run(parsed as never);
    const option = ws.source(sc.ok.ingredientId)?.options.find((o) => o.vendorId === sc.okVendorId);
    const line = ws.drafts()[0]?.lines[0];
    expect(line?.qty).toBe(sc.ok.qty);
    expect(line?.unitCost).toBe(option?.unitCost);
    expect(line?.unitCost).not.toBe(0.01);
  });

  it("rejects malformed tool input", () => {
    const { tools } = setup();
    expect(() => tools.find((t) => t.name === "check_vendors")?.parse({})).toThrow();
  });

  it("lets the model escalate a shortage with its own note", () => {
    const { sc, ws, tools } = setup();
    expect(
      call(tools, "escalate_to_menu_agent", {
        ingredient_id: sc.slow.ingredientId,
        note: "No vendor can deliver this today.",
      }).ok,
    ).toBe(true);
    expect(ws.handoffList()[0]).toMatchObject({
      ingredientId: sc.slow.ingredientId,
      detail: "No vendor can deliver this today.",
    });
  });

  it("shows vendor compliance in check_vendors", () => {
    const { sc, tools } = setup();
    const result = call(tools, "check_vendors", { ingredient_id: sc.unverified.ingredientId });
    expect(result.outcome).toBe("no-compliant-vendor");
    expect(result.vendors[0]).toMatchObject({
      vendor_id: "hearth-bakery",
      compliance: "unverified",
    });
  });
});

describe("inventory agent: AI mode", () => {
  it("uses the model's choices and wording, and rules finish whatever it skipped", async () => {
    const sc = agentScenario();
    const runModel: RunModel = async ({ tools }) => {
      call(tools, "add_to_draft_order", {
        ingredient_id: sc.ok.ingredientId,
        vendor_id: sc.okVendorId,
        rationale: "This vendor is the only eligible supplier arriving in time.",
      });
      call(tools, "escalate_to_menu_agent", {
        ingredient_id: sc.slow.ingredientId,
        note: "This runs out today and no vendor can deliver in time.",
      });
      return "Ordered one item and flagged another.";
    };
    const result = await runInventoryAgent(sc.state, { reference, runModel });
    expect(result.mode).toBe("ai");
    expect(result.summary).toBe("Ordered one item and flagged another.");
    expect(
      result.messages.find((m) => m.id === `inv-agent-order-${sc.ok.ingredientId}`)?.text,
    ).toContain("This vendor is the only eligible supplier");
    expect(result.handoffs.find((h) => h.ingredientId === sc.slow.ingredientId)?.detail).toBe(
      "This runs out today and no vendor can deliver in time.",
    );
    // Everything else was completed by rules.
    expect(result.messages.some((m) => m.id === "inv-agent-rules-completed")).toBe(true);
    const rulesOnly = await runInventoryAgent(sc.state, { reference });
    expect(ids(result.drafts)).toEqual(ids(rulesOnly.drafts));
  });

  it("keeps the model's factual claims out of the facts: prices come from code", async () => {
    const sc = agentScenario();
    const runModel: RunModel = async ({ tools }) => {
      call(tools, "add_to_draft_order", {
        ingredient_id: sc.ok.ingredientId,
        vendor_id: sc.okVendorId,
        rationale: "Great price.",
      });
      return "Done.";
    };
    const recommended = new InventoryWorkspace(sc.state, reference).source(
      sc.ok.ingredientId,
    )?.recommended;
    if (!recommended) throw new Error("fixture: expected a recommended vendor");
    const result = await runInventoryAgent(sc.state, { reference, runModel });
    const text = result.messages.find(
      (m) => m.id === `inv-agent-order-${sc.ok.ingredientId}`,
    )?.text;
    const facts = `${sc.ok.name}: ${sc.ok.qty} ${sc.ok.unit} from ${recommended.vendorName} for $${recommended.total.toFixed(2)}, arriving ${recommended.deliveryDate}.`;
    // The factual part is written by code; the model's wording only follows it.
    expect(text).toBe(`${facts} Great price.`);
  });

  it("falls back to rules when the model call fails", async () => {
    const runModel: RunModel = async () => {
      throw new Error("API unavailable");
    };
    const { state } = agentScenario();
    const result = await runInventoryAgent(state, { reference, runModel });
    expect(result.mode).toBe("rules");
    expect(result.error).toBe("API unavailable");
    expect(result.drafts.length + result.handoffs.length).toBeGreaterThan(0);
  });

  it("falls back to rules when the model is declined or fails midway, without losing earlier choices' safety", async () => {
    const sc = agentScenario();
    const runModel: RunModel = async ({ tools }) => {
      // Refused by the rules: the only supplier is unverified.
      call(tools, "add_to_draft_order", {
        ingredient_id: sc.unverified.ingredientId,
        vendor_id: "hearth-bakery",
      });
      throw new Error("The model declined this request.");
    };
    const result = await runInventoryAgent(sc.state, { reference, runModel });
    expect(result.mode).toBe("rules");
    expect(ids(result.drafts)).not.toContain(sc.unverified.ingredientId);
    expect(result.handoffs.some((h) => h.ingredientId === sc.unverified.ingredientId)).toBe(true);
  });
});
