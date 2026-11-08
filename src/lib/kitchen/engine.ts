import { DISHES, dishById } from "./data";
import {
  MEALS,
  type AgentMessage,
  type Conflict,
  type Dish,
  type KitchenState,
  type Meal,
  type Proposal,
  type PurchaseProposal,
  type Resident,
  type SubstitutionProposal,
} from "./types";

/** Dietary Agent: why a dish is unsafe for a resident (empty = safe). */
export function conflictReasons(r: Resident, dish: Dish): string[] {
  const out: string[] = [];
  for (const a of r.allergens) if (dish.allergens.includes(a)) out.push(`contains ${a}`);
  if (r.diets.includes("vegetarian") && !dish.tags.includes("vegetarian")) out.push("not vegetarian");
  if (r.diets.includes("low-sodium") && dish.tags.includes("high-sodium")) out.push("high sodium");
  if (r.diets.includes("diabetic") && dish.tags.includes("high-sugar")) out.push("high sugar");
  if (r.diets.includes("pureed") && !dish.tags.includes("pureed")) out.push("not puréed");
  else if (r.diets.includes("soft") && !dish.tags.includes("soft") && !dish.tags.includes("pureed"))
    out.push("not soft texture");
  return out;
}

const firstName = (r: Resident): string => r.name.split(" ")[0] ?? r.name;
const list = (names: string[]) =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const round = (n: number) => Math.round(n * 100) / 100;

export interface Analysis {
  conflicts: Conflict[];
  proposals: Proposal[];
  messages: AgentMessage[];
  demand: Record<string, number>;
  served: Record<Meal, Record<string, string>>; // projected dish per resident
}

export function analyze(state: KitchenState): Analysis {
  const decided = new Set(state.history.map((h) => h.proposalId));
  const conflicts: Conflict[] = [];
  const proposals: Proposal[] = [];
  const messages: AgentMessage[] = [];
  const served = { breakfast: {}, lunch: {}, dinner: {} } as Analysis["served"];
  const stockOf = (id: string) => {
    const i = state.ingredients.find((x) => x.id === id);
    return i ? i.stock + i.onOrder : 0;
  };

  for (const meal of MEALS) {
    const main = dishById(state.plan[meal]);
    const overrides = state.overrides[meal];
    const conflicted: { r: Resident; dishId: string; reasons: string[] }[] = [];
    for (const r of state.residents) {
      const dishId = overrides[r.id] ?? main.id;
      served[meal][r.id] = dishId;
      const reasons = conflictReasons(r, dishById(dishId));
      if (reasons.length) conflicted.push({ r, dishId, reasons });
    }

    if (!conflicted.length) {
      messages.push({ id: `diet-ok-${meal}`, agent: "dietary", meal, tone: "ok", text: `All ${state.residents.length} residents are cleared for ${meal}.` });
      continue;
    }

    const byReason = new Map<string, string[]>();
    for (const c of conflicted) for (const why of c.reasons) byReason.set(why, [...(byReason.get(why) ?? []), firstName(c.r)]);
    const detail = [...byReason.entries()].map(([why, n]) => `${list(n)} (${why})`).join("; ");
    messages.push({
      id: `diet-${meal}`, agent: "dietary", to: "menu", meal, tone: "alert",
      text: `${conflicted.length} resident${conflicted.length > 1 ? "s" : ""} cannot have ${main.name}: ${detail}.`,
    });

    // Menu Agent: greedy cover of conflicted residents with safe alternatives.
    let remaining = [...conflicted];
    const candidates = DISHES.filter((d) => d.meal === meal && d.id !== main.id);
    while (remaining.length) {
      let best: Dish | null = null;
      let bestCovered: typeof remaining = [];
      let bestScore = -1;
      for (const d of candidates) {
        // Only offer a puréed dish to residents who actually need puréed texture.
        const covered = remaining.filter((c) => conflictReasons(c.r, d).length === 0 && (!d.tags.includes("pureed") || c.r.diets.includes("pureed")));
        if (!covered.length) continue;
        const likes = covered.filter((c) => c.r.likes.some((l) => d.name.toLowerCase().includes(l.toLowerCase()))).length;
        const stockOk = d.ingredients.every((ing) => stockOf(ing.id) >= ing.qty * covered.length) ? 0.5 : 0;
        const score = covered.length * 10 + likes + stockOk;
        if (score > bestScore) { best = d; bestCovered = covered; bestScore = score; }
      }
      if (!best) break;
      const ids = bestCovered.map((c) => c.r.id).sort();
      const id = `sub-${meal}-${best.id}-${ids.join(".")}`;
      remaining = remaining.filter((c) => !ids.includes(c.r.id));
      if (decided.has(id)) {
        for (const c of bestCovered) conflicts.push({ meal, residentId: c.r.id, dishId: c.dishId, reasons: c.reasons, status: "needs-staff" });
        continue;
      }
      const p: SubstitutionProposal = {
        id, kind: "substitution", agent: "menu", meal, fromDishId: main.id, dishId: best.id, residentIds: ids,
        reasons: Object.fromEntries(bestCovered.map((c) => [c.r.id, c.reasons])),
      };
      proposals.push(p);
      for (const c of bestCovered) { conflicts.push({ meal, residentId: c.r.id, dishId: c.dishId, reasons: c.reasons, status: "proposal-pending" }); served[meal][c.r.id] = best.id; }
      messages.push({ id: `menu-${id}`, agent: "menu", to: "staff", meal, tone: "info", text: `I can substitute ${best.name} for ${list(bestCovered.map((c) => firstName(c.r)))}. Sent for staff approval.` });
    }
    for (const c of remaining) conflicts.push({ meal, residentId: c.r.id, dishId: c.dishId, reasons: c.reasons, status: "needs-staff" });
    if (remaining.length)
      messages.push({ id: `menu-none-${meal}`, agent: "menu", to: "staff", meal, tone: "alert", text: `No safe ${meal} option on file for ${list(remaining.map((c) => firstName(c.r)))}. Staff decision needed.` });
  }

  // Inventory Agent: projected demand (approved + pending plans) vs stock + incoming.
  const demand: Record<string, number> = {};
  for (const meal of MEALS)
    for (const dishId of Object.values(served[meal]))
      for (const ing of dishById(dishId).ingredients) demand[ing.id] = round((demand[ing.id] ?? 0) + ing.qty);

  const byVendor = new Map<string, PurchaseProposal["lines"]>();
  for (const ing of state.ingredients) {
    const need = demand[ing.id] ?? 0;
    const shortage = round(need - ing.stock - ing.onOrder);
    if (shortage <= 0) continue;
    const qty = Math.ceil(shortage / ing.packSize) * ing.packSize;
    byVendor.set(ing.vendor, [...(byVendor.get(ing.vendor) ?? []), { ingredientId: ing.id, shortage, qty }]);
    messages.push({ id: `inv-${ing.id}`, agent: "inventory", to: "staff", tone: "alert", text: `We need ${shortage} additional ${ing.unit} of ${ing.name.toLowerCase()}. I've prepared a purchase request to ${ing.vendor}.` });
  }
  for (const [vendor, lines] of byVendor) {
    const prefix = `po-${slug(vendor)}-`;
    const n = state.history.filter((h) => h.proposalId.startsWith(prefix)).length;
    const total = round(lines.reduce((s, l) => s + l.qty * (state.ingredients.find((i) => i.id === l.ingredientId)?.unitCost ?? 0), 0));
    proposals.push({ id: `${prefix}${n}`, kind: "purchase", agent: "inventory", vendor, lines, total });
  }
  if (!byVendor.size) messages.push({ id: "inv-ok", agent: "inventory", tone: "ok", text: "Stock covers every planned and proposed meal today." });

  return { conflicts, proposals, messages, demand, served };
}

export function lineCost(state: KitchenState, ingredientId: string, qty: number) {
  return round(qty * (state.ingredients.find((i) => i.id === ingredientId)?.unitCost ?? 0));
}
