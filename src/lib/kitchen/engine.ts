import { DISHES, dishById } from "./data";
import { approvalDueDate, dateKey, dayAt, scheduledState } from "./schedule";
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
  const care = `${r.careProfile?.["Diet Type"] ?? ""} ${r.careProfile?.["Religious/Cultural Requirements"] ?? ""}`.toLowerCase();
  if (care.includes("halal") && dish.halal === false) out.push("not halal");
  if (/\bvegan\b/.test(care) && dish.vegan === false) out.push("not vegan");
  if (r.diets.includes("low-sodium") && dish.tags.includes("high-sodium")) out.push("high sodium");
  if (r.diets.includes("diabetic") && dish.tags.includes("high-sugar")) out.push("high sugar");
  if (r.diets.includes("pureed") && !dish.tags.includes("pureed")) out.push("not puréed");
  else if (r.diets.includes("soft") && !dish.tags.includes("soft") && !dish.tags.includes("pureed"))
    out.push("not soft texture");
  return out;
}

export function dietarySignature(r: Resident): string {
  return JSON.stringify([[...r.allergens].sort(), [...r.diets].sort(), r.dietaryRevision ?? 0]);
}

/** Resolve standing staff authorizations without persisting generated daily decisions. */
export function resolveMenuState(state: KitchenState, offset = 0, reference = new Date()): KitchenState {
  const day = scheduledState(state, offset, reference);
  const overrides = { breakfast: { ...day.overrides.breakfast }, lunch: { ...day.overrides.lunch }, dinner: { ...day.overrides.dinner } };
  for (const meal of MEALS) {
    const main = dishById(day.plan[meal]);
    for (const resident of day.residents) {
      const explicit = overrides[meal][resident.id];
      if (explicit && conflictReasons(resident, dishById(explicit)).length) delete overrides[meal][resident.id];
      if (offset < 0 || overrides[meal][resident.id] || !conflictReasons(resident, main).length) continue;
      const saved = day.alternativePreferences?.find((p) => p.residentId === resident.id && p.meal === meal && p.fromDishId === main.id && p.dietarySignature === dietarySignature(resident));
      const dish = saved ? DISHES.find((d) => d.id === saved.dishId && d.meal === meal) : undefined;
      if (dish && !conflictReasons(resident, dish).length) overrides[meal][resident.id] = dish.id;
    }
  }
  return { ...day, overrides };
}

const firstName = (r: Resident): string => r.name.split(" ")[0] ?? r.name;
const list = (names: string[]) =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const round = (n: number) => Math.round(n * 100) / 100;

/** Recipe quantities are per serving in g/ml; stock is tracked in kg/L. Convert before comparing. */
export function perServingQty(stockUnit: string, qty: number, recipeUnit?: "g" | "ml"): number {
  if (recipeUnit === "g" && stockUnit === "kg") return qty / 1000;
  if (recipeUnit === "ml" && stockUnit === "L") return qty / 1000;
  return qty;
}

export interface Analysis {
  mealReviews?: MealReview[];
  forecast?: {
    days: { date: string; demand: Record<string, number> }[];
    demand: Record<string, number>;
    firstShortDate: Record<string, string>;
    todayShortage: Record<string, number>;
    unresolved: number;
    horizonDays: 7 | 14;
  };
  conflicts: Conflict[];
  proposals: Proposal[];
  messages: AgentMessage[];
  demand: Record<string, number>;
  served: Record<Meal, Record<string, string>>; // projected dish per resident
}

export interface MealReview {
  serviceDate: string;
  approvalDueDate: string;
  meal: Meal;
  mainDishId: string;
  signature: string;
  approved: boolean;
  rejected: boolean;
  pending: number;
  unresolved: number;
}

export function mealSignature(state: KitchenState, meal: Meal) {
  return JSON.stringify([state.plan[meal], state.overrides[meal], state.residents.map((r) => [r.id, r.allergens, r.diets])]);
}

/** Earlier deadlines first, then breakfast/lunch/dinner for the same service. */
export function compareMealUrgency(a: MealReview, b: MealReview) {
  return a.approvalDueDate.localeCompare(b.approvalDueDate) || a.serviceDate.localeCompare(b.serviceDate) || MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal);
}

export function analyzeMenuDay(state: KitchenState, offset = 0, reference = new Date()): Analysis {
  return analyzeDay(resolveMenuState(state, offset, reference), dateKey(dayAt(offset, reference)));
}

function analyzeDay(state: KitchenState, serviceDate?: string): Analysis {
  const decided = new Set(state.history.filter((h) => h.status === "rejected").map((h) => h.proposalId));
  const conflicts: Conflict[] = [];
  const proposals: Proposal[] = [];
  const messages: AgentMessage[] = [];
  const served = { breakfast: {}, lunch: {}, dinner: {} } as Analysis["served"];
  const stockOf = (id: string) => {
    const i = state.ingredients.find((x) => x.id === id);
    return i ? i.stock : 0;
  };
  const servingQty = (ing: { id: string; qty: number; unit?: "g" | "ml" }) =>
    perServingQty(state.ingredients.find((x) => x.id === ing.id)?.unit ?? "", ing.qty, ing.unit);

  for (const meal of MEALS) {
    const main = dishById(state.plan[meal]);
    const overrides = state.overrides[meal];
    const revisionSuffix = (ids: string[]) => ids.some((id) => (state.residents.find((r) => r.id === id)?.dietaryRevision ?? 0) > 0) ? `-requirements-${ids.map((id) => state.residents.find((r) => r.id === id)?.dietaryRevision ?? 0).join(".")}` : "";
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
    const remembered = new Map<string, typeof remaining>();
    for (const c of remaining) {
      const preference = state.alternativePreferences?.find((p) => p.residentId === c.r.id && p.meal === meal && p.fromDishId === main.id);
      const dish = preference ? DISHES.find((d) => d.id === preference.dishId && d.meal === meal) : undefined;
      if (dish && conflictReasons(c.r, dish).length === 0) remembered.set(dish.id, [...(remembered.get(dish.id) ?? []), c]);
    }
    for (const [dishId, covered] of remembered) {
      const ids = covered.map((c) => c.r.id).sort();
      const id = `sub-${serviceDate}-${meal}-${main.id}-${dishId}-${ids.join(".")}${revisionSuffix(ids)}`;
      remaining = remaining.filter((c) => !ids.includes(c.r.id));
      if (decided.has(id)) {
        for (const c of covered) conflicts.push({ meal, residentId: c.r.id, dishId: c.dishId, reasons: c.reasons, status: "needs-staff" });
        continue;
      }
      proposals.push({ id, kind: "substitution", agent: "menu", meal, fromDishId: main.id, dishId, residentIds: ids, reasons: Object.fromEntries(covered.map((c) => [c.r.id, c.reasons])), ...(serviceDate ? { serviceDate, approvalDueDate: approvalDueDate(serviceDate) } : {}) });
      for (const c of covered) { conflicts.push({ meal, residentId: c.r.id, dishId: c.dishId, reasons: c.reasons, status: "proposal-pending" }); served[meal][c.r.id] = dishId; }
    }
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
        const stockOk = d.ingredients.every((ing) => stockOf(ing.id) >= servingQty(ing) * covered.length) ? 0.5 : 0;
        const score = covered.length * 10 + likes + stockOk;
        if (score > bestScore) { best = d; bestCovered = covered; bestScore = score; }
      }
      if (!best) break;
      const ids = bestCovered.map((c) => c.r.id).sort();
      const id = (serviceDate ? `sub-${serviceDate}-${meal}-${main.id}-${best.id}-${ids.join(".")}` : `sub-${meal}-${best.id}-${ids.join(".")}`) + revisionSuffix(ids);
      remaining = remaining.filter((c) => !ids.includes(c.r.id));
      if (decided.has(id)) {
        for (const c of bestCovered) conflicts.push({ meal, residentId: c.r.id, dishId: c.dishId, reasons: c.reasons, status: "needs-staff" });
        continue;
      }
      const p: SubstitutionProposal = {
        id, kind: "substitution", agent: "menu", meal, fromDishId: main.id, dishId: best.id, residentIds: ids,
        reasons: Object.fromEntries(bestCovered.map((c) => [c.r.id, c.reasons])),
        ...(serviceDate ? { serviceDate, approvalDueDate: approvalDueDate(serviceDate) } : {}),
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
      for (const ing of dishById(dishId).ingredients) demand[ing.id] = round((demand[ing.id] ?? 0) + servingQty(ing));

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

/** Shared purchasing forecast: today plus upcoming scheduled meals, with safe swaps. */
export function analyze(state: KitchenState, reference = new Date()): Analysis {
  const today = analyzeMenuDay(state, 0, reference);
  const menuDays = Array.from({ length: 8 }, (_, offset) => ({ offset, result: offset === 0 ? today : analyzeMenuDay(state, offset, reference) }));
  const mealReviews = menuDays.flatMap(({ offset, result }) => {
    const serviceDate = dateKey(dayAt(offset, reference));
    const dayState = resolveMenuState(state, offset, reference);
    return MEALS.map((meal): MealReview => {
      const signature = mealSignature(dayState, meal);
      return { serviceDate, approvalDueDate: approvalDueDate(serviceDate), meal, mainDishId: dayState.plan[meal], signature,
        approved: state.mealApprovals?.[serviceDate]?.[meal]?.signature === signature,
        rejected: state.mealRejections?.[serviceDate]?.[meal]?.signature === signature,
        pending: result.conflicts.filter((c) => c.meal === meal && c.status === "proposal-pending").length,
        unresolved: result.conflicts.filter((c) => c.meal === meal && c.status === "needs-staff").length };
    });
  });
  const horizonDays = state.purchaseHorizonDays ?? 7;
  const leadTime = Math.max(1, state.leadTimeDays ?? 2);
  const days = Array.from({ length: horizonDays }, (_, offset) => {
    const result = menuDays[offset]?.result ?? analyzeMenuDay(state, offset, reference);
    return { date: dateKey(dayAt(offset, reference)), demand: result.demand, unresolved: result.conflicts.filter((c) => c.status === "needs-staff").length };
  });
  const demand: Record<string, number> = {};
  const firstShortDate: Record<string, string> = {};
  const todayShortage: Record<string, number> = {};
  const byVendor = new Map<string, PurchaseProposal["lines"]>();
  const forecastIngredients = [...state.ingredients, ...Object.keys(Object.assign({}, ...days.map((day) => day.demand))).filter((id) => !state.ingredients.some((i) => i.id === id)).map((id) => ({ id, stock: 0, onOrder: 0, packSize: 1, vendor: "Unlisted ingredient", unitCost: 0 }))];
  for (const ingredient of forecastIngredients) {
    let balance = ingredient.stock;
    const incoming = (state.orders ?? []).filter((order) => order.status === "incoming").flatMap((order) => order.lines.filter((line) => line.ingredientId === ingredient.id).map((line) => ({ date: order.deliveryDate, qty: line.qty })));
    const tracked = incoming.reduce((sum, line) => sum + line.qty, 0);
    const legacyIncoming = Math.max(0, ingredient.onOrder - tracked);
    if (legacyIncoming) incoming.push({ date: dateKey(dayAt(leadTime, reference)), qty: legacyIncoming });
    let used = 0;
    for (let offset = 0; offset < days.length; offset++) {
      const day = days[offset];
      if (!day) continue;
      // Unreceived/overdue deliveries never become available for today's service.
      if (offset > 0) balance += incoming.filter((line) => line.date === day.date || (offset === 1 && line.date < day.date)).reduce((sum, line) => sum + line.qty, 0);
      const need = day.demand[ingredient.id] ?? 0;
      used = round(used + need);
      balance = round(balance - need);
      if (balance < 0 && !firstShortDate[ingredient.id]) firstShortDate[ingredient.id] = day.date;
      if (offset === 0 && balance < 0) todayShortage[ingredient.id] = round(-balance);
    }
    demand[ingredient.id] = used;
    const arrivingWithinWindow = incoming.filter((line) => line.date <= (days.at(-1)?.date ?? "")).reduce((sum, line) => sum + line.qty, 0);
    const shortage = round(used - ingredient.stock - arrivingWithinWindow);
    if (!state.ingredients.some((i) => i.id === ingredient.id)) continue;
    if (shortage <= 0) continue;
    const qty = Math.ceil(shortage / ingredient.packSize) * ingredient.packSize;
    byVendor.set(ingredient.vendor, [...(byVendor.get(ingredient.vendor) ?? []), { ingredientId: ingredient.id, shortage, qty }]);
  }
  const proposals = menuDays.flatMap(({ result }) => result.proposals.filter((p) => p.kind === "substitution"));
  const purchases: PurchaseProposal[] = [];
  const messages = today.messages.filter((message) => message.agent !== "inventory");
  for (const [vendor, lines] of byVendor) {
    const prefix = `po-${slug(vendor)}-`;
    const signature = `${horizonDays}-${lines.map((line) => `${line.ingredientId}.${line.qty}`).join("-")}`;
    const id = `${prefix}${signature}`;
    if (state.history.some((decision) => decision.proposalId === id && decision.status === "rejected")) continue;
    const neededDate = lines.map((line) => firstShortDate[line.ingredientId]).filter((date): date is string => Boolean(date)).sort()[0] ?? dateKey(dayAt(leadTime, reference));
    const needed = new Date(`${neededDate}T12:00:00`);
    const orderByDate = dateKey(dayAt(-leadTime, needed));
    purchases.push({ id, kind: "purchase", agent: "inventory", vendor, lines, total: round(lines.reduce((sum, line) => sum + lineCost(state, line.ingredientId, line.qty), 0)), horizonDays, deliveryDate: dateKey(dayAt(leadTime, reference)), neededDate, orderByDate });
    messages.push({ id: `inv-${id}`, agent: "inventory", to: "staff", tone: "alert", text: `${vendor}: purchase request for ${horizonDays}-day consumption. First shortage ${neededDate}; allow ${leadTime} days for delivery.` });
  }
  if (Object.keys(todayShortage).length) messages.push({ id: "inv-service-risk", agent: "inventory", to: "staff", tone: "alert", text: "Today's stock is short. Incoming purchases cannot cover same-day service; arrange an available-stock alternative." });
  if (!purchases.length) messages.push({ id: "inv-ok", agent: "inventory", tone: "ok", text: `No new purchase requests for the ${horizonDays}-day plan. Check service risks separately from incoming stock.` });
  return { ...today, mealReviews, proposals: [...proposals, ...purchases], messages, forecast: { days, demand, firstShortDate, todayShortage, horizonDays, unresolved: days.reduce((sum, day) => sum + day.unresolved, 0) } };
}

export function lineCost(state: KitchenState, ingredientId: string, qty: number) {
  return round(qty * (state.ingredients.find((i) => i.id === ingredientId)?.unitCost ?? 0));
}
