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

const reference = new Date("2026-11-09T12:00:00");

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

describe("inventory agent: rules mode (no model)", () => {
  it("handles every shortage: draft or hand to the Menu Agent", async () => {
    const ws = new InventoryWorkspace(initialState(), reference);
    const result = await runInventoryAgent(initialState(), { reference });
    const handled = new Set([
      ...result.drafts.flatMap((d) => d.lines.map((l) => l.ingredientId)),
      ...result.handoffs.map((h) => h.ingredientId),
    ]);
    expect(result.mode).toBe("rules");
    expect(ws.shortages.length).toBeGreaterThan(0);
    expect([...handled].sort()).toEqual(ws.shortages.map((s) => s.ingredientId).sort());
  });

  it("only drafts orders from eligible, on-time vendors, and every draft awaits approval", async () => {
    const result = await runInventoryAgent(initialState(), { reference });
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
    const result = await runInventoryAgent(initialState(), { reference });
    const reason = (id: string) => result.handoffs.find((h) => h.ingredientId === id)?.reason;
    expect(reason("salmon")).toBe("too-slow");
    expect(reason("gf-bread")).toBe("no-compliant-vendor");
    expect(result.messages.find((m) => m.id === "inv-agent-handoff-gf-bread")).toMatchObject({
      to: "menu",
      tone: "alert",
    });
  });

  it("totals each draft from its lines", async () => {
    const result = await runInventoryAgent(initialState(), { reference });
    for (const draft of result.drafts)
      expect(draft.total).toBeCloseTo(
        draft.lines.reduce((sum, l) => sum + l.total, 0),
        2,
      );
  });

  it("explains a cheaper vendor it skipped for compliance", async () => {
    // With 1-day lead time Valley Farms can deliver in time; the cheaper co-op has no license on file.
    const state: KitchenState = { ...initialState(), leadTimeDays: 1 };
    const result = await runInventoryAgent(state, { reference });
    const skipped = result.messages.find((m) => m.text.startsWith("Skipped Sunrise Produce Co-op"));
    expect(skipped?.text).toContain("no license on file");
    expect(result.drafts.some((d) => d.vendorId === "sunrise-coop")).toBe(false);
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
    const ws = new InventoryWorkspace(initialState(), reference);
    return { ws, tools: buildInventoryTools(ws) };
  };

  it("lists shortages with quantities and dates", () => {
    const { tools } = setup();
    const list = call(tools, "list_shortages", {});
    expect(list.find((s: { ingredient_id: string }) => s.ingredient_id === "quinoa")).toMatchObject(
      { quantity_to_order: 3, first_short_date: "2026-11-11", status: "open" },
    );
  });

  it("refuses to order from an unverified vendor", () => {
    const { tools } = setup();
    const result = call(tools, "add_to_draft_order", {
      ingredient_id: "gf-bread",
      vendor_id: "hearth-bakery",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unverified/);
  });

  it("refuses an eligible vendor that arrives after the shortage", () => {
    const { tools } = setup();
    const result = call(tools, "add_to_draft_order", {
      ingredient_id: "salmon",
      vendor_id: "pacific-seafood",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/after the 2026-11-09 shortage/);
  });

  it("refuses a vendor that does not supply the ingredient", () => {
    const { tools } = setup();
    expect(
      call(tools, "add_to_draft_order", { ingredient_id: "quinoa", vendor_id: "harbor-fresh" }).ok,
    ).toBe(false);
  });

  it("refuses ingredients that are not shortages", () => {
    const { tools } = setup();
    expect(
      call(tools, "add_to_draft_order", { ingredient_id: "rice", vendor_id: "sysco" }).ok,
    ).toBe(false);
  });

  it("accepts an eligible on-time vendor, once", () => {
    const { ws, tools } = setup();
    expect(
      call(tools, "add_to_draft_order", {
        ingredient_id: "quinoa",
        vendor_id: "sysco",
        rationale: "Only eligible supplier that arrives in time.",
      }).ok,
    ).toBe(true);
    expect(
      call(tools, "add_to_draft_order", { ingredient_id: "quinoa", vendor_id: "sysco" }).error,
    ).toMatch(/already handled/);
    expect(ws.drafts()[0]?.lines[0]).toMatchObject({ ingredientId: "quinoa", qty: 3 });
  });

  it("fixes quantity and price in code, ignoring anything the model adds", () => {
    const { ws, tools } = setup();
    const tool = tools.find((t) => t.name === "add_to_draft_order");
    // Extra fields (quantity, price) are not part of the schema and never reach the order.
    const parsed = tool?.parse({
      ingredient_id: "quinoa",
      vendor_id: "sysco",
      quantity: 9999,
      price: 0.01,
    });
    tool?.run(parsed as never);
    const line = ws.drafts()[0]?.lines[0];
    expect(line?.qty).toBe(3);
    expect(line?.unitCost).toBe(6.5);
  });

  it("rejects malformed tool input", () => {
    const { tools } = setup();
    expect(() => tools.find((t) => t.name === "check_vendors")?.parse({})).toThrow();
  });

  it("lets the model escalate a shortage with its own note", () => {
    const { ws, tools } = setup();
    expect(
      call(tools, "escalate_to_menu_agent", {
        ingredient_id: "salmon",
        note: "No vendor can deliver salmon today.",
      }).ok,
    ).toBe(true);
    expect(ws.handoffList()[0]).toMatchObject({
      ingredientId: "salmon",
      detail: "No vendor can deliver salmon today.",
    });
  });

  it("shows vendor compliance in check_vendors", () => {
    const { tools } = setup();
    const result = call(tools, "check_vendors", { ingredient_id: "gf-bread" });
    expect(result.outcome).toBe("no-compliant-vendor");
    expect(result.vendors[0]).toMatchObject({
      vendor_id: "hearth-bakery",
      compliance: "unverified",
    });
  });
});

describe("inventory agent: AI mode", () => {
  it("uses the model's choices and wording, and rules finish whatever it skipped", async () => {
    const runModel: RunModel = async ({ tools }) => {
      call(tools, "add_to_draft_order", {
        ingredient_id: "quinoa",
        vendor_id: "sysco",
        rationale: "Sysco is the only eligible supplier arriving before Nov 11.",
      });
      call(tools, "escalate_to_menu_agent", {
        ingredient_id: "salmon",
        note: "Salmon runs out today and no vendor can deliver in time.",
      });
      return "Ordered quinoa and flagged salmon.";
    };
    const result = await runInventoryAgent(initialState(), { reference, runModel });
    expect(result.mode).toBe("ai");
    expect(result.summary).toBe("Ordered quinoa and flagged salmon.");
    expect(result.messages.find((m) => m.id === "inv-agent-order-quinoa")?.text).toContain(
      "Sysco is the only eligible supplier",
    );
    expect(result.handoffs.find((h) => h.ingredientId === "salmon")?.detail).toBe(
      "Salmon runs out today and no vendor can deliver in time.",
    );
    // Everything else was completed by rules.
    expect(result.messages.some((m) => m.id === "inv-agent-rules-completed")).toBe(true);
    const rulesOnly = await runInventoryAgent(initialState(), { reference });
    expect(result.drafts.flatMap((d) => d.lines.map((l) => l.ingredientId)).sort()).toEqual(
      rulesOnly.drafts.flatMap((d) => d.lines.map((l) => l.ingredientId)).sort(),
    );
  });

  it("keeps the model's factual claims out of the facts: prices come from code", async () => {
    const runModel: RunModel = async ({ tools }) => {
      call(tools, "add_to_draft_order", {
        ingredient_id: "quinoa",
        vendor_id: "sysco",
        rationale: "Great price.",
      });
      return "Done.";
    };
    const result = await runInventoryAgent(initialState(), { reference, runModel });
    expect(result.messages.find((m) => m.id === "inv-agent-order-quinoa")?.text).toMatch(
      /^Quinoa: 3 kg from Sysco for \$19\.50, arriving 2026-11-11\./,
    );
  });

  it("falls back to rules when the model call fails", async () => {
    const runModel: RunModel = async () => {
      throw new Error("API unavailable");
    };
    const result = await runInventoryAgent(initialState(), { reference, runModel });
    expect(result.mode).toBe("rules");
    expect(result.error).toBe("API unavailable");
    expect(result.drafts.length + result.handoffs.length).toBeGreaterThan(0);
  });

  it("falls back to rules when the model is declined or fails midway, without losing earlier choices' safety", async () => {
    const runModel: RunModel = async ({ tools }) => {
      call(tools, "add_to_draft_order", { ingredient_id: "gf-bread", vendor_id: "hearth-bakery" }); // refused by the rules
      throw new Error("The model declined this request.");
    };
    const result = await runInventoryAgent(initialState(), { reference, runModel });
    expect(result.mode).toBe("rules");
    expect(result.drafts.some((d) => d.lines.some((l) => l.ingredientId === "gf-bread"))).toBe(
      false,
    );
    expect(result.handoffs.some((h) => h.ingredientId === "gf-bread")).toBe(true);
  });
});
