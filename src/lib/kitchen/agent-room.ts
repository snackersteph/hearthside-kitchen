import { DISHES, dishById } from "./data";
import {
  analyze,
  analyzeMenuDay,
  conflictReasons,
  perServingQty,
  resolveMenuState,
} from "./engine";
import type { DraftPurchaseRequest } from "./inventory-agent";
import { dateKey } from "./schedule";
import type { reducer } from "./store";
import type { AgentId, Dish, KitchenState, Meal, SubstitutionProposal } from "./types";
import { sourceIngredient, type VendorSourcing } from "./vendor-engine";

/**
 * Agent Room: the Dietary, Menu and Inventory agents working on one request, step by step, as a
 * visible conversation. Pure and deterministic: every fact comes from the app's own engine
 * (dietary rules, stock forecast, vendor compliance), so the conversation can never contradict
 * the rest of the app. The agents "talk" by this function calling the next agent's logic.
 *
 * Flow: Chef asks -> Menu proposes -> Dietary checks every resident -> Inventory checks stock and
 * vendors -> (if a vendor cannot deliver in time) Inventory hands off to Menu -> Menu swaps the dish
 * -> Dietary and Inventory re-check -> the Chef is asked to approve.
 */

export type RoomActor = AgentId | "chef" | "management";
export type RoomKind =
  "request" | "proposal" | "check" | "handoff" | "approval-request" | "decision";

export interface RoomEvent {
  id: string;
  from: RoomActor;
  to: RoomActor | "all";
  kind: RoomKind;
  tone: "info" | "alert" | "ok";
  text: string;
}

export interface RoomPlan {
  date: string;
  meal: Meal;
  dishId: string;
  dishName: string;
  /** Resident id -> safe alternative dish id (from the Dietary check). */
  overrides: Record<string, string>;
  alternatives: { dishId: string; dishName: string; residentNames: string[] }[];
  /** Residents with no safe option on file: a person must decide. */
  unresolved: string[];
  /** Ingredients no compliant vendor can deliver in time for this meal. */
  blocked: { ingredientId: string; name: string; reason: string }[];
  orders: DraftPurchaseRequest[];
  orderTotal: number;
  /** Who must approve: purchases above the threshold need Management. */
  approver: "chef" | "management";
  /** True when nothing is left unresolved, so the plan can be approved. */
  ready: boolean;
}

export interface RoomThread {
  id: string;
  date: string;
  meal: Meal;
  events: RoomEvent[];
  plan: RoomPlan;
  /** Dishes already proposed in this thread, so "another option" never repeats one. */
  tried: string[];
}

/** Purchases above this total need Management's approval, not only the Chef's. */
export const MANAGEMENT_APPROVAL_THRESHOLD = 200;

type KitchenAction = Parameters<typeof reducer>[1];

export const round = (n: number) => Math.round(n * 100) / 100;
export const money = (n: number) => `$${n.toFixed(2)}`;
export const firstName = (name: string) => name.split(" ")[0] ?? name;
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const list = (items: string[]) =>
  items.length <= 1
    ? items.join("")
    : items.length === 2
      ? `${items[0]} and ${items[1]}`
      : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
/** A readable list that stays short: the first few names, then a count. */
export const short = (items: string[], max = 3) =>
  items.length <= max
    ? list(items)
    : `${items.slice(0, max).join(", ")} and ${items.length - max} more`;
export const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
export const offsetOf = (date: string, reference: Date) =>
  Math.round(
    (new Date(`${date}T12:00:00`).getTime() -
      new Date(`${dateKey(reference)}T12:00:00`).getTime()) /
      86_400_000,
  );

/* ---------------------------------------------------------------- */
/* Evaluating one candidate main dish                                */
/* ---------------------------------------------------------------- */

export interface Risk {
  ingredientId: string;
  name: string;
  unit: string;
  orderQty: number;
  sourcing: VendorSourcing;
}

export interface Evaluation {
  dish: Dish;
  conflicted: { residentId: string; name: string; reasons: string[] }[];
  covered: { dishId: string; residentIds: string[] }[];
  uncovered: { residentId: string; name: string }[];
  overrides: Record<string, string>;
  /** Ingredients this meal needs that will be short by the service date. */
  risks: Risk[];
  orderable: Risk[];
  blocked: Risk[];
}

function withMainDish(state: KitchenState, date: string, meal: Meal, dishId: string): KitchenState {
  return {
    ...state,
    scheduledPlans: {
      ...state.scheduledPlans,
      [date]: { ...state.scheduledPlans?.[date], [meal]: dishId },
    },
    scheduledOverrides: {
      ...state.scheduledOverrides,
      [date]: { ...state.scheduledOverrides?.[date], [meal]: {} },
    },
  };
}

export function evaluate(
  state: KitchenState,
  date: string,
  meal: Meal,
  dishId: string,
  reference: Date,
): Evaluation {
  const offset = offsetOf(date, reference);
  const scratch = withMainDish(state, date, meal, dishId);
  const day = analyzeMenuDay(scratch, offset, reference);
  const nameOf = (id: string) => state.residents.find((r) => r.id === id)?.name ?? id;

  const conflicted = day.conflicts
    .filter((c) => c.meal === meal)
    .map((c) => ({ residentId: c.residentId, name: nameOf(c.residentId), reasons: c.reasons }));
  const uncovered = day.conflicts
    .filter((c) => c.meal === meal && c.status === "needs-staff")
    .map((c) => ({ residentId: c.residentId, name: nameOf(c.residentId) }));
  const overrides: Record<string, string> = {};
  const covered: Evaluation["covered"] = [];
  for (const p of day.proposals) {
    if (p.kind !== "substitution" || p.meal !== meal) continue;
    const proposal = p as SubstitutionProposal;
    covered.push({ dishId: proposal.dishId, residentIds: proposal.residentIds });
    for (const id of proposal.residentIds) overrides[id] = proposal.dishId;
  }

  // What this meal will actually consume, including the alternatives served.
  const demand: Record<string, number> = {};
  for (const servedDishId of Object.values(day.served[meal])) {
    for (const ing of dishById(servedDishId).ingredients) {
      const unit = state.ingredients.find((i) => i.id === ing.id)?.unit ?? "";
      demand[ing.id] = round((demand[ing.id] ?? 0) + perServingQty(unit, ing.qty, ing.unit));
    }
  }

  const analysis = analyze(scratch, reference);
  const firstShort = analysis.forecast?.firstShortDate ?? {};
  const purchaseQty = new Map<string, number>();
  for (const p of analysis.proposals)
    if (p.kind === "purchase")
      for (const line of p.lines) purchaseQty.set(line.ingredientId, line.qty);

  const risks: Risk[] = [];
  for (const [ingredientId, need] of Object.entries(demand)) {
    const shortDate = firstShort[ingredientId];
    if (!shortDate || shortDate > date) continue;
    const ingredient = state.ingredients.find((i) => i.id === ingredientId);
    if (!ingredient) continue;
    const orderQty =
      purchaseQty.get(ingredientId) ?? Math.ceil(need / ingredient.packSize) * ingredient.packSize;
    const sourcing = sourceIngredient(ingredient, orderQty, {
      neededDate: date,
      reference,
      ...(state.leadTimeDays !== undefined ? { defaultLeadTimeDays: state.leadTimeDays } : {}),
    });
    risks.push({ ingredientId, name: ingredient.name, unit: ingredient.unit, orderQty, sourcing });
  }
  risks.sort((a, b) => a.name.localeCompare(b.name));

  return {
    dish: dishById(dishId),
    conflicted,
    covered,
    uncovered,
    overrides,
    risks,
    orderable: risks.filter((r) => r.sourcing.outcome === "ok"),
    blocked: risks.filter((r) => r.sourcing.outcome !== "ok"),
  };
}

const score = (e: Evaluation): [number, number, number, number, string] => [
  e.blocked.length,
  e.uncovered.length,
  e.conflicted.length,
  e.orderable.length,
  e.dish.name,
];
const better = (a: Evaluation, b: Evaluation) => {
  const x = score(a);
  const y = score(b);
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return (x[i] as number) < (y[i] as number);
  return x[4] < y[4];
};

/** The Menu Agent's search for another main dish: skip dishes that use an unavailable ingredient, then rank. */
export function chooseReplacement(
  state: KitchenState,
  date: string,
  meal: Meal,
  excluded: string[],
  avoid: Set<string>,
  reference: Date,
): Evaluation | undefined {
  const candidates = DISHES.filter(
    (d) =>
      d.meal === meal && !excluded.includes(d.id) && !d.ingredients.some((i) => avoid.has(i.id)),
  )
    .map((dish) => ({
      dish,
      conflicts: state.residents.filter((r) => conflictReasons(r, dish).length > 0).length,
    }))
    .sort((a, b) => a.conflicts - b.conflicts || a.dish.name.localeCompare(b.dish.name))
    .slice(0, 10);
  let best: Evaluation | undefined;
  for (const { dish } of candidates) {
    const e = evaluate(state, date, meal, dish.id, reference);
    if (!best || better(e, best)) best = e;
  }
  return best;
}

/* ---------------------------------------------------------------- */
/* Purchase drafts                                                   */
/* ---------------------------------------------------------------- */

export function draftsFrom(risks: Risk[]): DraftPurchaseRequest[] {
  const byVendor = new Map<string, Risk[]>();
  for (const r of risks) {
    const rec = r.sourcing.recommended;
    if (rec) byVendor.set(rec.vendorId, [...(byVendor.get(rec.vendorId) ?? []), r]);
  }
  return [...byVendor.entries()].map(([vendorId, group]) => {
    const lines = group.map((r) => {
      const option = r.sourcing.recommended!;
      return {
        ingredientId: r.ingredientId,
        ingredientName: r.name,
        qty: r.orderQty,
        unit: r.unit,
        unitCost: option.unitCost,
        total: option.total,
      };
    });
    return {
      id: `po-room-${vendorId}-${lines.map((l) => `${l.ingredientId}.${l.qty}`).join("-")}`,
      vendorId,
      vendorName: group[0]!.sourcing.recommended!.vendorName,
      lines,
      total: round(lines.reduce((sum, l) => sum + l.total, 0)),
      deliveryDate:
        group
          .map((r) => r.sourcing.recommended!.deliveryDate)
          .sort()
          .at(-1) ?? "",
      status: "draft" as const,
      warnings: [...new Set(group.flatMap((r) => r.sourcing.recommended!.compliance.warnings))],
    };
  });
}

export function whyBlocked(r: Risk): string {
  const { sourcing } = r;
  if (sourcing.outcome === "too-slow") {
    const earliest = sourcing.options
      .filter((o) => o.compliance.status === "eligible")
      .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate))[0];
    return earliest
      ? `the earliest delivery is ${dayLabel(earliest.deliveryDate)}`
      : "no vendor can deliver in time";
  }
  if (sourcing.outcome === "no-compliant-vendor")
    return `no compliant vendor (${[...new Set(sourcing.options.flatMap((o) => o.compliance.reasons))].join("; ")})`;
  return "no vendor on file";
}

/* ---------------------------------------------------------------- */
/* What each agent says (shared by the replay and the live flow)      */
/* ---------------------------------------------------------------- */

export type Say = (
  from: RoomActor,
  to: RoomActor | "all",
  kind: RoomKind,
  tone: RoomEvent["tone"],
  text: string,
) => void;
export interface NarrationContext {
  state: KitchenState;
  date: string;
  meal: Meal;
  say: Say;
}

/** Dietary Agent's verdict on an evaluation. */
export function narrateDietary(
  { state, say }: NarrationContext,
  e: Evaluation,
  recheck: boolean,
): void {
  const residents = state.residents.length;
  if (!e.conflicted.length) {
    say(
      "dietary",
      "menu",
      "check",
      "ok",
      `${recheck ? "Re-checked: all" : "All"} ${residents} residents are cleared for ${e.dish.name}.`,
    );
    return;
  }
  const byReason = new Map<string, string[]>();
  for (const c of e.conflicted)
    for (const why of c.reasons)
      byReason.set(why, [...(byReason.get(why) ?? []), firstName(c.name)]);
  const detail = [...byReason.entries()]
    .map(([why, names]) => `${short(names)} (${why})`)
    .join("; ");
  const alternatives = e.covered.map(
    (c) =>
      `${dishById(c.dishId).name} for ${short(c.residentIds.map((rid) => firstName(state.residents.find((r) => r.id === rid)?.name ?? rid)))}`,
  );
  let text = `${recheck ? "Re-checked: " : ""}${plural(e.conflicted.length, "resident")} can't have ${e.dish.name}: ${detail}.`;
  if (alternatives.length) text += ` Safe alternatives: ${alternatives.join("; ")}.`;
  if (e.uncovered.length)
    text += ` No safe option on file for ${list(e.uncovered.map((u) => firstName(u.name)))}, so staff must decide.`;
  say("dietary", "menu", "check", e.uncovered.length ? "alert" : "info", text);
}

/** Inventory Agent's verdict on an evaluation. */
export function narrateInventory(
  { meal, date, say }: NarrationContext,
  e: Evaluation,
  recheck: boolean,
): void {
  const when = dayLabel(date);
  if (!e.risks.length) {
    say(
      "inventory",
      "menu",
      "check",
      "ok",
      `${recheck ? "Re-checked: stock" : "Stock"} covers ${meal} on ${when}. No order needed.`,
    );
    return;
  }
  if (e.blocked.length) {
    // Group ingredients that share the same reason, so the message does not repeat itself.
    const byReason = new Map<string, string[]>();
    for (const r of e.blocked)
      byReason.set(whyBlocked(r), [...(byReason.get(whyBlocked(r)) ?? []), r.name.toLowerCase()]);
    const reasons = [...byReason.entries()]
      .map(([why, names]) => (byReason.size === 1 ? why : `${list(names)}: ${why}`))
      .join("; ");
    say(
      "inventory",
      "menu",
      "handoff",
      "alert",
      `I can't get ${list(e.blocked.map((r) => r.name.toLowerCase()))} by ${when}: ${reasons}. Menu Agent, please swap the dish.`,
    );
  }
  if (e.orderable.length) {
    const drafts = draftsFrom(e.orderable);
    const total = round(drafts.reduce((sum, d) => sum + d.total, 0));
    say(
      "inventory",
      "chef",
      "check",
      "info",
      `${recheck ? "Re-checked: " : ""}${e.blocked.length ? "The rest I can order in time. " : ""}Short on ${list(e.orderable.map((r) => r.name.toLowerCase()))}. Drafted ${plural(drafts.length, "order")} totalling ${money(total)} from ${list(drafts.map((d) => d.vendorName))}, arriving by ${when}.`,
    );
    for (const r of e.orderable) {
      const chosen = r.sourcing.recommended;
      const skipped = r.sourcing.options.find(
        (o) =>
          chosen &&
          o.vendorId !== chosen.vendorId &&
          o.total < chosen.total &&
          o.compliance.status !== "eligible",
      );
      if (skipped) {
        const [first, ...rest] = skipped.compliance.reasons;
        say(
          "inventory",
          "chef",
          "check",
          "alert",
          `Skipped ${skipped.vendorName} for ${r.name.toLowerCase()} (${money(skipped.total)}, cheaper): ${first?.toLowerCase()}${rest.length ? ` (+${rest.length} more)` : ""}.`,
        );
      }
    }
  }
}

/** Why the Menu Agent likes a replacement dish, in a sentence. */
export function swapReason(state: KitchenState, swap: Evaluation, avoid: Set<string>): string {
  const names = [...avoid].map(
    (i) => state.ingredients.find((x) => x.id === i)?.name.toLowerCase() ?? i,
  );
  const reason = names.length ? `it avoids ${list(names)}` : "it is a safe, available choice";
  const eaters =
    swap.conflicted.length === 0
      ? "every resident can eat it"
      : `only ${plural(swap.conflicted.length, "resident")} need${swap.conflicted.length === 1 ? "s" : ""} an alternative`;
  return `${reason}, and ${eaters}`;
}

/** The plan the agents would put in front of a person for one evaluated dish. */
export function buildPlan(
  state: KitchenState,
  date: string,
  meal: Meal,
  current: Evaluation,
): RoomPlan {
  const orders = draftsFrom(current.orderable);
  const orderTotal = round(orders.reduce((sum, o) => sum + o.total, 0));
  return {
    date,
    meal,
    dishId: current.dish.id,
    dishName: current.dish.name,
    overrides: current.overrides,
    alternatives: current.covered.map((c) => ({
      dishId: c.dishId,
      dishName: dishById(c.dishId).name,
      residentNames: c.residentIds.map(
        (rid) => state.residents.find((r) => r.id === rid)?.name ?? rid,
      ),
    })),
    unresolved: current.uncovered.map((u) => u.name),
    blocked: current.blocked.map((r) => ({
      ingredientId: r.ingredientId,
      name: r.name,
      reason: whyBlocked(r),
    })),
    orders,
    orderTotal,
    approver: orderTotal > MANAGEMENT_APPROVAL_THRESHOLD ? "management" : "chef",
    ready: current.uncovered.length === 0 && current.blocked.length === 0,
  };
}

/* ---------------------------------------------------------------- */
/* The conversation                                                  */
/* ---------------------------------------------------------------- */

export function runAgentRoom(
  state: KitchenState,
  opts: { date: string; meal: Meal; reference?: Date; exclude?: string[]; id?: string },
): RoomThread {
  const reference = opts.reference ?? new Date();
  const { date, meal } = opts;
  const offset = offsetOf(date, reference);
  if (offset < 1 || offset > 6)
    throw new RangeError("Plans can be requested for tomorrow up to six days ahead.");

  const id = opts.id ?? `room-${date}-${meal}`;
  const tried = [...(opts.exclude ?? [])];
  const events: RoomEvent[] = [];
  const say = (
    from: RoomActor,
    to: RoomActor | "all",
    kind: RoomKind,
    tone: RoomEvent["tone"],
    text: string,
  ) => events.push({ id: `${id}-${events.length + 1}`, from, to, kind, tone, text });
  const when = dayLabel(date);
  const residents = state.residents.length;

  const ctx: NarrationContext = { state, date, meal, say };
  const dietaryReview = (e: Evaluation, recheck: boolean) => narrateDietary(ctx, e, recheck);
  const inventoryReview = (e: Evaluation, recheck: boolean) => narrateInventory(ctx, e, recheck);

  const planned = dishById(resolveMenuState(state, offset, reference).plan[meal]);
  let current: Evaluation;

  if (tried.length) {
    say(
      "chef",
      "menu",
      "request",
      "info",
      `That plan isn't right. Show me another option for ${meal} on ${when}.`,
    );
    const next = chooseReplacement(state, date, meal, tried, new Set(), reference);
    if (!next) {
      say(
        "menu",
        "chef",
        "proposal",
        "alert",
        `I've run out of safe options for ${meal} on ${when}. We'll keep ${planned.name} for now.`,
      );
      current = evaluate(state, date, meal, planned.id, reference);
    } else {
      current = next;
      say(
        "menu",
        "all",
        "proposal",
        "info",
        `How about ${next.dish.name}? Dietary and Inventory, please check it.`,
      );
      dietaryReview(next, false);
      inventoryReview(next, false);
    }
  } else {
    say("chef", "menu", "request", "info", `Please plan ${meal} for ${when}.`);
    current = evaluate(state, date, meal, planned.id, reference);
    say(
      "menu",
      "dietary",
      "proposal",
      "info",
      `I'm proposing ${planned.name} for ${meal} on ${when}. Dietary, please check it against all ${residents} residents.`,
    );
    dietaryReview(current, false);
    say(
      "menu",
      "inventory",
      "proposal",
      "info",
      `Dietary-checked plan: ${planned.name}${current.covered.length ? ` plus ${plural(current.covered.length, "alternative dish", "alternative dishes")}` : ""}. Inventory, can you cover the ingredients by ${when}?`,
    );
    inventoryReview(current, false);

    if (current.blocked.length) {
      const avoid = new Set(current.blocked.map((r) => r.ingredientId));
      const swap = chooseReplacement(state, date, meal, [planned.id], avoid, reference);
      if (swap) {
        const why = swapReason(state, swap, avoid);
        say(
          "menu",
          "all",
          "proposal",
          "info",
          `Swapping ${planned.name} for ${swap.dish.name}: ${why}. Dietary and Inventory, please re-check.`,
        );
        tried.push(planned.id);
        current = swap;
        dietaryReview(swap, true);
        inventoryReview(swap, true);
      } else {
        say(
          "menu",
          "chef",
          "proposal",
          "alert",
          `I couldn't find a ${meal} dish that avoids the shortage. I'm keeping ${planned.name}; the unavailable items need a Chef decision.`,
        );
      }
    }
  }
  if (!tried.includes(current.dish.id)) tried.push(current.dish.id);

  const plan = buildPlan(state, date, meal, current);
  const { orders, orderTotal } = plan;

  const summary = [
    `${current.dish.name}`,
    plan.alternatives.length
      ? `${plural(
          plan.alternatives.reduce((n, a) => n + a.residentNames.length, 0),
          "resident",
        )} on safe alternatives`
      : "",
    orders.length ? `a draft order of ${money(orderTotal)}` : "",
  ].filter(Boolean);
  if (plan.ready) {
    say(
      "menu",
      "chef",
      "approval-request",
      "ok",
      `Ready for your approval: ${list(summary)}. ${plan.approver === "management" ? `The order is over ${money(MANAGEMENT_APPROVAL_THRESHOLD)}, so Management must approve it.` : orders.length ? "Approve to save the menu and place the order." : "Approve to save and sign off the menu."}`,
    );
  } else {
    const open = [
      ...plan.unresolved.map((n) => `no safe option for ${firstName(n)}`),
      ...plan.blocked.map((b) => `${b.name.toLowerCase()} unavailable`),
    ];
    say(
      "menu",
      "chef",
      "approval-request",
      "alert",
      `I can't finish this plan on my own: ${list(open)}. Please decide, or ask me for another option.`,
    );
  }

  return { id, date, meal, events, plan, tried };
}

/* ---------------------------------------------------------------- */
/* Applying the Chef's decision                                      */
/* ---------------------------------------------------------------- */

/** The app's existing actions that carry out an approved plan, in order. */
export function planActions(plan: RoomPlan): KitchenAction[] {
  return [
    {
      type: "setMealPlan",
      date: plan.date,
      meal: plan.meal,
      dishId: plan.dishId,
      overrides: plan.overrides,
    },
    { type: "approveMeal", date: plan.date, meal: plan.meal },
    ...plan.orders.map((o): KitchenAction => ({
      type: "approvePurchase",
      proposalId: o.id,
      lines: o.lines.map((l) => ({ ingredientId: l.ingredientId, shortage: l.qty, qty: l.qty })),
      modified: false,
      summary: `Approved ${o.vendorName} order (${money(o.total)})`,
      vendor: o.vendorName,
      deliveryDate: o.deliveryDate,
    })),
  ];
}

/** The conversation lines that follow a decision by the Chef or Management. */
export function decisionEvents(
  thread: RoomThread,
  decision: "approved" | "rejected",
  by: "chef" | "management" = "chef",
  startIndex = thread.events.length,
): RoomEvent[] {
  const { plan } = thread;
  const make = (
    from: RoomActor,
    to: RoomActor | "all",
    kind: RoomKind,
    tone: RoomEvent["tone"],
    text: string,
    n: number,
  ): RoomEvent => ({ id: `${thread.id}-${startIndex + n}`, from, to, kind, tone, text });
  if (decision === "rejected") return [make(by, "menu", "decision", "info", "Not this one.", 1)];
  const out: RoomEvent[] = [
    make(by, "all", "decision", "ok", "Approved.", 1),
    make(
      "menu",
      by,
      "decision",
      "ok",
      `Saved ${plan.dishName} for ${plan.meal} on ${dayLabel(plan.date)} and signed it off.`,
      2,
    ),
  ];
  if (plan.orders.length)
    out.push(
      make(
        "inventory",
        by,
        "decision",
        "ok",
        `Placed ${plural(plan.orders.length, "order")} (${money(plan.orderTotal)}): ${list(plan.orders.map((o) => `${o.vendorName}, arriving ${dayLabel(o.deliveryDate)}`))}.`,
        3,
      ),
    );
  return out;
}

/** The Chef hands a plan whose order is over the threshold to Management. */
export function escalationEvents(
  thread: RoomThread,
  startIndex = thread.events.length,
): RoomEvent[] {
  const { plan } = thread;
  return [
    {
      id: `${thread.id}-${startIndex + 1}`,
      from: "chef",
      to: "management",
      kind: "approval-request",
      tone: "info",
      text: `Please approve ${plan.dishName} for ${plan.meal} on ${dayLabel(plan.date)}. The order is ${money(plan.orderTotal)}, over the ${money(MANAGEMENT_APPROVAL_THRESHOLD)} limit.`,
    },
  ];
}
