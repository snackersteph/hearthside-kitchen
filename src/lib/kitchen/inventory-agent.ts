import { z } from "zod";
import { analyze } from "./engine";
import { dateKey } from "./schedule";
import type { AgentMessage, KitchenState, PurchaseProposal } from "./types";
import {
  sourceIngredient,
  type SourcingOutcome,
  type VendorOption,
  type VendorSourcing,
} from "./vendor-engine";

/**
 * Inventory Agent (the Procurement Specialist).
 *
 * Division of labour:
 *  - Facts and rules (shortages, prices, vendor compliance, delivery dates) come
 *    from deterministic code and are enforced inside the tools below.
 *  - The AI model decides which eligible vendor to use and writes the plain-language
 *    explanations. It cannot order from a blocked, unverified or too-slow vendor,
 *    cannot change quantities or prices, and every order is only a DRAFT that staff approve.
 *
 * This module has no SDK import, so it is safe in the browser bundle and easy to test.
 * The model call is injected (see `RunModel`); without one, or if it fails, the same
 * rules run without AI so the demo always works.
 */

export interface Shortage {
  ingredientId: string;
  name: string;
  unit: string;
  /** Amount missing over the planning horizon. */
  shortage: number;
  /** Pack-rounded quantity to order. */
  qty: number;
  /** First date the kitchen runs out. */
  neededDate?: string;
}

export interface DraftLine {
  ingredientId: string;
  ingredientName: string;
  qty: number;
  unit: string;
  unitCost: number;
  total: number;
}

export interface DraftPurchaseRequest {
  id: string;
  vendorId: string;
  vendorName: string;
  lines: DraftLine[];
  total: number;
  /** Latest delivery date across the lines. */
  deliveryDate: string;
  /** Always a draft: staff must approve before anything is ordered. */
  status: "draft";
  /** Eligible vendor, but staff should know (e.g. certificate expires soon). */
  warnings: string[];
}

export interface Handoff {
  ingredientId: string;
  ingredientName: string;
  reason: SourcingOutcome | "agent-choice";
  detail: string;
}

export interface InventoryAgentResult {
  /** "ai" = model drove the decisions; "rules" = deterministic fallback. */
  mode: "ai" | "rules";
  summary: string;
  messages: AgentMessage[];
  drafts: DraftPurchaseRequest[];
  /** Shortages the Menu Agent must resolve with a substitution. */
  handoffs: Handoff[];
  sourcing: VendorSourcing[];
  /** Set when the model run failed and the rules fallback took over. */
  error?: string;
}

const round = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${n.toFixed(2)}`;

export function findShortages(state: KitchenState, reference = new Date()): Shortage[] {
  const analysis = analyze(state, reference);
  const out: Shortage[] = [];
  const seen = new Set<string>();
  for (const proposal of analysis.proposals) {
    if (proposal.kind !== "purchase") continue;
    for (const line of (proposal as PurchaseProposal).lines) {
      const ingredient = state.ingredients.find((i) => i.id === line.ingredientId);
      if (!ingredient || seen.has(ingredient.id)) continue;
      seen.add(ingredient.id);
      const neededDate = analysis.forecast?.firstShortDate[ingredient.id];
      out.push({
        ingredientId: ingredient.id,
        name: ingredient.name,
        unit: ingredient.unit,
        shortage: line.shortage,
        qty: line.qty,
        ...(neededDate ? { neededDate } : {}),
      });
    }
  }
  return out.sort(
    (a, b) =>
      (a.neededDate ?? "9999").localeCompare(b.neededDate ?? "9999") ||
      a.name.localeCompare(b.name),
  );
}

type Pick = { option: VendorOption; rationale?: string };
export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

/** All state for one agent run. Tools and the rules fallback share the same enforcement. */
export class InventoryWorkspace {
  readonly shortages: Shortage[];
  private readonly sourcing = new Map<string, VendorSourcing>();
  private readonly picks = new Map<string, Pick>();
  private readonly handoffs = new Map<string, Handoff>();

  constructor(
    readonly state: KitchenState,
    readonly reference = new Date(),
  ) {
    this.shortages = findShortages(state, reference);
  }

  shortage(ingredientId: string) {
    return this.shortages.find((s) => s.ingredientId === ingredientId);
  }

  source(ingredientId: string): VendorSourcing | undefined {
    const shortage = this.shortage(ingredientId);
    const ingredient = this.state.ingredients.find((i) => i.id === ingredientId);
    if (!shortage || !ingredient) return undefined;
    const cached = this.sourcing.get(ingredientId);
    if (cached) return cached;
    const result = sourceIngredient(ingredient, shortage.qty, {
      reference: this.reference,
      ...(this.state.leadTimeDays !== undefined
        ? { defaultLeadTimeDays: this.state.leadTimeDays }
        : {}),
      ...(shortage.neededDate ? { neededDate: shortage.neededDate } : {}),
    });
    this.sourcing.set(ingredientId, result);
    return result;
  }

  /** Add an ingredient to the draft order. Refuses anything the rules do not allow. */
  addToDraft(ingredientId: string, vendorId: string, rationale?: string): ActionResult {
    const shortage = this.shortage(ingredientId);
    const sourcing = this.source(ingredientId);
    if (!shortage || !sourcing)
      return { ok: false, error: `${ingredientId} is not a current shortage.` };
    if (this.picks.has(ingredientId) || this.handoffs.has(ingredientId))
      return { ok: false, error: `${shortage.name} is already handled.` };
    const option = sourcing.options.find((o) => o.vendorId === vendorId);
    if (!option) return { ok: false, error: `${vendorId} does not supply ${shortage.name}.` };
    if (option.compliance.status !== "eligible")
      return {
        ok: false,
        error: `${option.vendorName} is ${option.compliance.status} (${option.compliance.reasons.join("; ")}). Choose another vendor or escalate.`,
      };
    if (!option.onTime)
      return {
        ok: false,
        error: `${option.vendorName} delivers ${option.deliveryDate}, after the ${shortage.neededDate} shortage. Choose another vendor or escalate.`,
      };
    this.picks.set(ingredientId, { option, ...(rationale ? { rationale } : {}) });
    return {
      ok: true,
      message: `Added ${shortage.name} from ${option.vendorName} to the draft order.`,
    };
  }

  /** Hand a shortage to the Menu Agent for a substitution. */
  escalate(ingredientId: string, note?: string): ActionResult {
    const shortage = this.shortage(ingredientId);
    const sourcing = this.source(ingredientId);
    if (!shortage || !sourcing)
      return { ok: false, error: `${ingredientId} is not a current shortage.` };
    if (this.picks.has(ingredientId) || this.handoffs.has(ingredientId))
      return { ok: false, error: `${shortage.name} is already handled.` };
    const reason: Handoff["reason"] = sourcing.outcome === "ok" ? "agent-choice" : sourcing.outcome;
    this.handoffs.set(ingredientId, {
      ingredientId,
      ingredientName: shortage.name,
      reason,
      detail: note ?? defaultHandoffDetail(shortage, sourcing),
    });
    return { ok: true, message: `Sent ${shortage.name} to the Menu Agent for a substitution.` };
  }

  /** Shortages neither drafted nor escalated. */
  pending(): Shortage[] {
    return this.shortages.filter(
      (s) => !this.picks.has(s.ingredientId) && !this.handoffs.has(s.ingredientId),
    );
  }

  /** The deterministic plan: cheapest eligible on-time vendor, otherwise escalate. */
  applyRules(): void {
    for (const shortage of this.pending()) {
      const recommended = this.source(shortage.ingredientId)?.recommended;
      if (recommended) this.addToDraft(shortage.ingredientId, recommended.vendorId);
      else this.escalate(shortage.ingredientId);
    }
  }

  drafts(): DraftPurchaseRequest[] {
    const byVendor = new Map<string, { picks: [Shortage, Pick][] }>();
    for (const shortage of this.shortages) {
      const pick = this.picks.get(shortage.ingredientId);
      if (!pick) continue;
      const group = byVendor.get(pick.option.vendorId) ?? { picks: [] };
      group.picks.push([shortage, pick]);
      byVendor.set(pick.option.vendorId, group);
    }
    return [...byVendor.entries()].map(([vendorId, { picks }]) => {
      const lines: DraftLine[] = picks.map(([shortage, pick]) => ({
        ingredientId: shortage.ingredientId,
        ingredientName: shortage.name,
        qty: shortage.qty,
        unit: shortage.unit,
        unitCost: pick.option.unitCost,
        total: pick.option.total,
      }));
      const first = picks[0]?.[1].option;
      return {
        id: `po-draft-${vendorId}-${lines.map((l) => `${l.ingredientId}.${l.qty}`).join("-")}`,
        vendorId,
        vendorName: first?.vendorName ?? vendorId,
        lines,
        total: round(lines.reduce((sum, l) => sum + l.total, 0)),
        deliveryDate:
          picks
            .map(([, p]) => p.option.deliveryDate)
            .sort()
            .at(-1) ?? "",
        status: "draft" as const,
        warnings: [...new Set(picks.flatMap(([, p]) => p.option.compliance.warnings))],
      };
    });
  }

  handoffList(): Handoff[] {
    return this.shortages.flatMap((s) => this.handoffs.get(s.ingredientId) ?? []);
  }

  /** Build the activity-feed messages. Numbers and skipped-vendor facts come from code, never the model. */
  messages(): AgentMessage[] {
    const out: AgentMessage[] = [];
    for (const shortage of this.shortages) {
      const pick = this.picks.get(shortage.ingredientId);
      const handoff = this.handoffs.get(shortage.ingredientId);
      const sourcing = this.source(shortage.ingredientId);
      if (pick) {
        const o = pick.option;
        const fact = `${shortage.name}: ${shortage.qty} ${shortage.unit} from ${o.vendorName} for ${money(o.total)}, arriving ${o.deliveryDate}.`;
        out.push({
          id: `inv-agent-order-${shortage.ingredientId}`,
          agent: "inventory",
          to: "staff",
          tone: "info",
          text: pick.rationale ? `${fact} ${pick.rationale}` : fact,
        });
        const cheaperSkipped = (sourcing?.options ?? []).filter(
          (x) =>
            x.vendorId !== o.vendorId && x.total < o.total && x.compliance.status !== "eligible",
        );
        for (const skipped of cheaperSkipped)
          out.push({
            id: `inv-agent-skip-${shortage.ingredientId}-${skipped.vendorId}`,
            agent: "inventory",
            to: "staff",
            tone: "alert",
            text: `Skipped ${skipped.vendorName} for ${shortage.name.toLowerCase()} (${money(skipped.total)}, cheaper): ${skipped.compliance.reasons.join("; ")}.`,
          });
        for (const warning of o.compliance.warnings)
          out.push({
            id: `inv-agent-warn-${shortage.ingredientId}-${warning}`,
            agent: "inventory",
            to: "staff",
            tone: "info",
            text: `${o.vendorName}: ${warning}. Consider renewing before the next order.`,
          });
      } else if (handoff) {
        out.push({
          id: `inv-agent-handoff-${shortage.ingredientId}`,
          agent: "inventory",
          to: "menu",
          tone: "alert",
          text: handoff.detail,
        });
      }
    }
    return out;
  }
}

function defaultHandoffDetail(shortage: Shortage, sourcing: VendorSourcing): string {
  const name = shortage.name;
  switch (sourcing.outcome) {
    case "too-slow": {
      const soonest = [...sourcing.options]
        .filter((o) => o.compliance.status === "eligible")
        .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate))[0];
      return `No eligible vendor can deliver ${name} by ${shortage.neededDate ?? "the date it runs out"}${soonest ? ` (earliest is ${soonest.vendorName} on ${soonest.deliveryDate})` : ""}. Menu Agent: please propose a substitution.`;
    }
    case "no-compliant-vendor":
      return `Every vendor for ${name} has a compliance problem (${[...new Set(sourcing.options.flatMap((o) => o.compliance.reasons))].join("; ")}). Menu Agent: please propose a substitution, or staff can override.`;
    case "no-vendor":
      return `No vendor on file supplies ${name}. Menu Agent: please propose a substitution.`;
    default:
      return `Escalated ${name} for a substitution.`;
  }
}

/* ------------------------------------------------------------------ */
/* Tools the model can call                                            */
/* ------------------------------------------------------------------ */

/** Structurally compatible with the Anthropic SDK's runnable tools, without importing it. */
export interface AgentToolSpec {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  parse: (content: unknown) => unknown;
  run: (input: never) => string;
}

const noInput = z.object({});
const checkInput = z.object({ ingredient_id: z.string().min(1) });
const draftInput = z.object({
  ingredient_id: z.string().min(1),
  vendor_id: z.string().min(1),
  rationale: z.string().max(400).optional(),
});
const escalateInput = z.object({
  ingredient_id: z.string().min(1),
  note: z.string().max(400).optional(),
});

const json = (value: unknown) => JSON.stringify(value);

export function buildInventoryTools(ws: InventoryWorkspace): AgentToolSpec[] {
  return [
    {
      name: "list_shortages",
      description:
        "List every ingredient the kitchen will run short of over the planning horizon, with the quantity to order and the first date it runs out. Call this first.",
      input_schema: { type: "object", properties: {} },
      parse: (c) => noInput.parse(c),
      run: () =>
        json(
          ws.shortages.map((s) => ({
            ingredient_id: s.ingredientId,
            name: s.name,
            unit: s.unit,
            quantity_to_order: s.qty,
            shortage: s.shortage,
            first_short_date: s.neededDate ?? null,
            status: ws.pending().includes(s) ? "open" : "handled",
          })),
        ),
    },
    {
      name: "check_vendors",
      description:
        "Compare every vendor that supplies one ingredient: price, delivery date, whether it arrives before the shortage, and license/certification compliance (eligible, unverified or blocked, with reasons). Only eligible, on-time vendors can be ordered from.",
      input_schema: {
        type: "object",
        properties: {
          ingredient_id: { type: "string", description: "Ingredient id from list_shortages" },
        },
        required: ["ingredient_id"],
      },
      parse: (c) => checkInput.parse(c),
      run: (input: z.infer<typeof checkInput>) => {
        const s = ws.source(input.ingredient_id);
        const shortage = ws.shortage(input.ingredient_id);
        if (!s || !shortage)
          return json({ error: `${input.ingredient_id} is not a current shortage.` });
        return json({
          ingredient: shortage.name,
          quantity: `${shortage.qty} ${shortage.unit}`,
          first_short_date: shortage.neededDate ?? null,
          outcome: s.outcome,
          engine_recommendation: s.recommended?.vendorId ?? null,
          vendors: s.options.map((o) => ({
            vendor_id: o.vendorId,
            vendor: o.vendorName,
            total_price: o.total,
            delivery_date: o.deliveryDate,
            arrives_on_time: o.onTime,
            compliance: o.compliance.status,
            problems: o.compliance.reasons,
            warnings: o.compliance.warnings,
          })),
        });
      },
    },
    {
      name: "add_to_draft_order",
      description:
        "Add one ingredient to the draft purchase order from a chosen vendor. Refused if the vendor is blocked, unverified, too slow, or does not supply it. Quantity and price are fixed by the system. The order stays a draft until staff approve it. Give a one- or two-sentence rationale a kitchen manager can read.",
      input_schema: {
        type: "object",
        properties: {
          ingredient_id: { type: "string" },
          vendor_id: { type: "string" },
          rationale: {
            type: "string",
            description: "Why this vendor, in plain language (max 2 sentences)",
          },
        },
        required: ["ingredient_id", "vendor_id"],
      },
      parse: (c) => draftInput.parse(c),
      run: (input: z.infer<typeof draftInput>) =>
        json(ws.addToDraft(input.ingredient_id, input.vendor_id, input.rationale)),
    },
    {
      name: "escalate_to_menu_agent",
      description:
        "Hand a shortage to the Menu Agent for a substitution when no eligible vendor can deliver in time. Include a short note explaining why.",
      input_schema: {
        type: "object",
        properties: {
          ingredient_id: { type: "string" },
          note: {
            type: "string",
            description: "What the Menu Agent should know (max 2 sentences)",
          },
        },
        required: ["ingredient_id"],
      },
      parse: (c) => escalateInput.parse(c),
      run: (input: z.infer<typeof escalateInput>) =>
        json(ws.escalate(input.ingredient_id, input.note)),
    },
  ];
}

export const INVENTORY_AGENT_SYSTEM = `You are the Inventory Agent for a senior living kitchen: the procurement specialist on a team with a Dietary Agent and a Menu Agent. Kitchen managers read your output, so be plain and brief.

Your job: turn each ingredient shortage into either a draft purchase order or a handoff to the Menu Agent.
- Use the tools for every fact. Never invent vendors, prices, dates or certifications.
- Only vendors that are eligible and arrive before the shortage can be ordered from. Never try to work around a blocked or unverified vendor; say why it was skipped.
- A cheaper vendor is not better if it is blocked, unverified or late. Prefer the cheapest eligible vendor that arrives in time.
- If no eligible vendor can deliver in time, escalate to the Menu Agent instead of ordering.
- Orders are drafts. A person approves them, so describe what you prepared, not what you ordered.

Handle every shortage. Finish with a summary of at most three sentences.`;

/* ------------------------------------------------------------------ */
/* Running the agent                                                   */
/* ------------------------------------------------------------------ */

export type RunModel = (args: {
  system: string;
  prompt: string;
  tools: AgentToolSpec[];
}) => Promise<string>;

export async function runInventoryAgent(
  state: KitchenState,
  opts: { reference?: Date; runModel?: RunModel } = {},
): Promise<InventoryAgentResult> {
  const reference = opts.reference ?? new Date();
  const ws = new InventoryWorkspace(state, reference);
  let mode: InventoryAgentResult["mode"] = "rules";
  let modelSummary = "";
  let error: string | undefined;

  if (ws.shortages.length && opts.runModel) {
    try {
      modelSummary = (
        await opts.runModel({
          system: INVENTORY_AGENT_SYSTEM,
          prompt: `Today is ${dateKey(reference)}. Review the kitchen's ingredient shortages and prepare draft purchase requests for staff approval, or hand shortages to the Menu Agent where no eligible vendor can deliver in time.`,
          tools: buildInventoryTools(ws),
        })
      ).trim();
      mode = "ai";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  // Safety net: the agent can never silently drop a shortage.
  const leftover = ws.pending().length;
  ws.applyRules();

  const drafts = ws.drafts();
  const handoffs = ws.handoffList();
  const total = round(drafts.reduce((sum, d) => sum + d.total, 0));
  const ruleSummary = !ws.shortages.length
    ? "Stock covers the planned menus. No purchase requests needed."
    : `Prepared ${drafts.length} draft purchase request${drafts.length === 1 ? "" : "s"} totalling ${money(total)}${handoffs.length ? `; ${handoffs.length} item${handoffs.length === 1 ? "" : "s"} sent to the Menu Agent for a substitution` : ""}. Awaiting staff approval.`;
  const messages = ws.messages();
  if (mode === "ai" && leftover)
    messages.push({
      id: "inv-agent-rules-completed",
      agent: "inventory",
      to: "staff",
      tone: "info",
      text: `${leftover} shortage${leftover === 1 ? "" : "s"} handled by standard rules because the agent did not finish them.`,
    });
  if (!ws.shortages.length)
    messages.push({ id: "inv-agent-ok", agent: "inventory", tone: "ok", text: ruleSummary });

  return {
    mode,
    summary: mode === "ai" && modelSummary ? modelSummary : ruleSummary,
    messages,
    drafts,
    handoffs,
    sourcing: ws.shortages.flatMap((s) => ws.source(s.ingredientId) ?? []),
    ...(error ? { error } : {}),
  };
}
