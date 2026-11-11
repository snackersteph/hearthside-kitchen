import { DISHES, dishById } from "./data";
import { analyzeMenuDay, conflictReasons, lineCost, perServingQty } from "./engine";
import { dateKey } from "./schedule";
import { MEALS, type KitchenState, type Meal } from "./types";
import {
  chooseDish, generateWeeklyMenu, residentRequirementSignature, setWeeklySlotDish, slotKey, slotRotation, slotSignature, weekDishUsage, weeklyMenu,
} from "./weekly-menu";
import {
  addDays, applyWeeklyStatus, createWeeklyPlan, daysBetween, isDateKey, lifecycleDates, parseDateKey, sortWeeklyPlans,
  weekStartFor, weeklyPlanId, type WeeklyPlan,
} from "./weekly-schedule";

// Weekly agent orchestration. The three "agents" are rule-based roles that run NutriSync's
// existing deterministic functions (conflictReasons, analyzeMenuDay, weekly menu generation,
// stock and order projections) one step at a time. No AI model is called: every summary
// below is computed from the selected week's residents, recipes, stock and orders.

export type AgentRole = "dietary" | "menu" | "inventory";
export type AgentParty = AgentRole | "team" | "manager";
export type AgentAction =
  | "share-dietary-constraints" | "send-ingredient-requirements" | "report-shortage" | "confirm-stock"
  | "propose-revision" | "recommend-purchase" | "revalidate-dietary" | "revalidate-inventory" | "validate-week"
  | "request-approval" | "approve-revision" | "decline-revision" | "replace-revision" | "approve-week" | "revalidation-required";
export type AgentEventStatus = "completed" | "warning" | "pending";
export type WorkflowStage = 1 | 2 | 3 | 4 | 5;

export interface ShortageFinding {
  ingredientId: string;
  name: string;
  unit: string;
  vendor: string;
  weekRequirement: number;
  availableAtWeekStart: number;
  incomingDuringWeek: number;
  shortfall: number;
  firstShortDate: string;
  /** Earliest date a new order could arrive (today + lead time). */
  earliestDelivery: string;
  /** False when the ingredient runs out before any new order could arrive: a real menu conflict. */
  purchasableInTime: boolean;
}

export interface RevisionProposal {
  date: string;
  meal: Meal;
  fromDishId: string;
  fromDishName: string;
  toDishId: string;
  toDishName: string;
  ingredientId: string;
  ingredientName: string;
}

export interface PurchaseRecommendationLine {
  ingredientId: string;
  name: string;
  unit: string;
  vendor: string;
  shortfall: number;
  qty: number;
  cost: number;
}

export type AgentPayload =
  | { kind: "dietary-constraints"; facts: string[]; residentsTotal: number; restrictedResidents: number; allergens: Record<string, number>; diets: Record<string, number>; halal: number; vegan: number }
  | { kind: "ingredient-requirements"; facts: string[]; generatedSlots: number; keptSlots: number; lockedSlots: number; alternativesInPlace: number; alternativesPending: number; unresolved: number; requirements: { ingredientId: string; name: string; unit: string; qty: number }[] }
  | { kind: "shortage"; facts: string[]; finding: ShortageFinding; slots: { date: string; meal: Meal; dishName: string; qty: number }[] }
  | { kind: "purchasable-shortages"; facts: string[]; findings: ShortageFinding[] }
  | { kind: "stock-confirmed"; facts: string[]; ingredientsChecked: number }
  | { kind: "revision"; facts: string[]; proposal: RevisionProposal }
  | { kind: "revision-unavailable"; facts: string[]; ingredientId: string; reason: string }
  | { kind: "purchase"; facts: string[]; lines: PurchaseRecommendationLine[]; total: number; orderByDate: string; neededBy: string; vendors: string[] }
  | { kind: "revalidation"; facts: string[]; proposalEventId: string; passed: boolean }
  | { kind: "week-validation"; facts: string[]; unresolved: number; pendingAlternatives: number; residentsCovered: number; residentsTotal: number }
  | { kind: "review-request"; facts: string[]; pendingRevisions: string[]; shortages: number; purchaseTotal: number }
  | { kind: "decision"; facts: string[]; proposalEventId: string; decision: "approved" | "declined" | "replaced" }
  | { kind: "week-approved"; facts: string[] }
  | { kind: "revalidation-required"; facts: string[]; slots: string[]; residentRequirementsChanged: boolean };

export interface AgentEvent {
  eventId: string;
  serviceWeekId: string;
  workflowRunId: string;
  sendingAgent: AgentParty;
  receivingAgent: AgentParty;
  action: AgentAction;
  stage: WorkflowStage;
  summary: string;
  structuredPayload: AgentPayload;
  affectedDate: string | null;
  affectedMeal: Meal | null;
  result: string;
  status: AgentEventStatus;
  timestamp: number;
}

export type WorkflowRunStatus = "running" | "awaiting-approval" | "completed" | "superseded" | "stopped";
export interface WorkflowRun {
  workflowRunId: string;
  serviceWeekId: string;
  status: WorkflowRunStatus;
  /** Number of orchestration steps completed (0…WORKFLOW_STEPS). */
  step: number;
  startedAt: number;
  updatedAt: number;
  finishedAt: number | null;
  stopReason?: string;
}

export const WORKFLOW_STEPS = 6;
export const WORKFLOW_STEP_LABELS = [
  "Dietary review", "Weekly menu generation", "Inventory check", "Revisions and purchasing", "Validation rerun", "Manager review",
] as const;
const RUNS_KEPT_PER_WEEK = 3;

// ---------- Small helpers ----------

const round = (n: number) => Math.round(n * 100) / 100;
const qty = (n: number, unit: string) => `${round(n)} ${unit}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const dayLabel = (date: string) => parseDateKey(date)?.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) ?? date;
const slotLabel = (date: string, meal: Meal) => `${dayLabel(date)} ${meal}`;
const money = (n: number) => `$${n.toFixed(2)}`;

export const runEvents = (s: KitchenState, runId: string) => (s.agentEvents ?? []).filter((e) => e.workflowRunId === runId);
export const latestRunFor = (s: KitchenState, weekId: string) =>
  (s.workflowRuns ?? []).filter((r) => r.serviceWeekId === weekId).sort((a, b) => b.startedAt - a.startedAt)[0];

const planFor = (s: KitchenState, weekId: string) => s.weeklyPlans?.find((p) => p.id === weekId);
const updateRun = (s: KitchenState, runId: string, patch: Partial<WorkflowRun>): KitchenState => ({
  ...s, workflowRuns: (s.workflowRuns ?? []).map((r) => (r.workflowRunId === runId ? { ...r, ...patch } : r)),
});
const updatePlan = (s: KitchenState, weekId: string, f: (p: WeeklyPlan) => WeeklyPlan): KitchenState => ({
  ...s, weeklyPlans: (s.weeklyPlans ?? []).map((p) => (p.id === weekId ? f(p) : p)),
});

type NewEvent = Omit<AgentEvent, "eventId" | "serviceWeekId" | "workflowRunId" | "timestamp" | "affectedDate" | "affectedMeal"> & { affectedDate?: string | null; affectedMeal?: Meal | null };
function appendEvents(s: KitchenState, run: WorkflowRun, events: NewEvent[], reference: Date): KitchenState {
  const start = runEvents(s, run.workflowRunId).length;
  const created = events.map((e, i): AgentEvent => ({
    ...e,
    eventId: `${run.workflowRunId}-e${start + i + 1}`,
    serviceWeekId: run.serviceWeekId,
    workflowRunId: run.workflowRunId,
    affectedDate: e.affectedDate ?? null,
    affectedMeal: e.affectedMeal ?? null,
    timestamp: reference.getTime(),
  }));
  return { ...s, agentEvents: [...(s.agentEvents ?? []), ...created] };
}

// ---------- Deterministic analyses ----------

interface IngredientProjection {
  ingredientId: string; name: string; unit: string; vendor: string; packSize: number;
  requirement: number; availableAtWeekStart: number; incomingDuringWeek: number; minBalance: number; firstShortDate: string | null;
}
interface WeekProjection {
  dates: string[];
  earliestDelivery: string;
  ingredients: Map<string, IngredientProjection>;
  /** Ingredient use per slot ("date|meal"), counting every resident's served dish. */
  slotUse: Map<string, Record<string, number>>;
}

/**
 * Projects stock from today through the end of the week: today's stock, minus every planned
 * service, plus incoming deliveries on their dates (mirroring analyze(): nothing delivered
 * today is usable today). Earlier weeks' deficits belong to their own purchasing, so the
 * selected week starts from what is left, never from a negative balance.
 */
export function projectWeekInventory(s: KitchenState, plan: WeeklyPlan, reference = new Date()): WeekProjection {
  const today = dateKey(reference);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(plan.startDate, i)).filter((d) => d >= today);
  const slotUse = new Map<string, Record<string, number>>();
  const total = Math.max(0, daysBetween(today, plan.endDate) + 1);
  const unitOf = (id: string) => s.ingredients.find((i) => i.id === id)?.unit ?? "";
  const daily: Record<string, number>[] = [];
  for (let offset = 0; offset < total; offset++) {
    const date = addDays(today, offset);
    const result = analyzeMenuDay(s, offset, reference);
    daily.push(result.demand);
    if (date < plan.startDate) continue;
    for (const meal of MEALS) {
      const use: Record<string, number> = {};
      for (const dishId of Object.values(result.served[meal])) {
        for (const ing of dishById(dishId).ingredients) use[ing.id] = round((use[ing.id] ?? 0) + perServingQty(unitOf(ing.id), ing.qty, ing.unit));
      }
      slotUse.set(`${date}|${meal}`, use);
    }
  }
  const leadTime = Math.max(1, s.leadTimeDays ?? 2);
  const ingredients = new Map<string, IngredientProjection>();
  const known = new Set(s.ingredients.map((i) => i.id));
  const unlisted = [...new Set(daily.flatMap((d) => Object.keys(d)))].filter((id) => !known.has(id))
    .map((id) => ({ id, name: id, unit: "", vendor: "Unlisted ingredient", packSize: 1, stock: 0, onOrder: 0 }));
  for (const ing of [...s.ingredients, ...unlisted]) {
    const incoming = (s.orders ?? []).filter((o) => o.status === "incoming")
      .flatMap((o) => o.lines.filter((l) => l.ingredientId === ing.id).map((l) => ({ date: o.deliveryDate, qty: l.qty })));
    const legacy = Math.max(0, ing.onOrder - incoming.reduce((n, l) => n + l.qty, 0));
    if (legacy) incoming.push({ date: dateKey(new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + leadTime, 12)), qty: legacy });
    let balance = ing.stock;
    let requirement = 0;
    let availableAtWeekStart = 0;
    let incomingDuringWeek = 0;
    let minBalance = Infinity;
    let firstShortDate: string | null = null;
    for (let offset = 0; offset < total; offset++) {
      const date = addDays(today, offset);
      const arriving = offset === 0 ? 0 : incoming.filter((l) => l.date === date || (offset === 1 && l.date < date)).reduce((n, l) => n + l.qty, 0);
      balance = round(balance + arriving);
      const inWeek = date >= plan.startDate;
      if (inWeek && date === dates[0]) availableAtWeekStart = balance = Math.max(0, balance);
      else if (inWeek) incomingDuringWeek = round(incomingDuringWeek + arriving);
      const need = daily[offset]?.[ing.id] ?? 0;
      balance = round(balance - need);
      if (!inWeek) continue;
      requirement = round(requirement + need);
      minBalance = Math.min(minBalance, balance);
      if (balance < 0 && !firstShortDate) firstShortDate = date;
    }
    ingredients.set(ing.id, {
      ingredientId: ing.id, name: ing.name, unit: ing.unit, vendor: ing.vendor, packSize: ing.packSize,
      requirement, availableAtWeekStart, incomingDuringWeek, minBalance: minBalance === Infinity ? 0 : minBalance, firstShortDate,
    });
  }
  return { dates, ingredients, slotUse, earliestDelivery: addDays(today, leadTime) };
}

export function weekShortages(projection: WeekProjection): ShortageFinding[] {
  return [...projection.ingredients.values()]
    .filter((p) => p.requirement > 0 && p.minBalance < 0 && p.firstShortDate)
    .map((p) => ({
      ingredientId: p.ingredientId, name: p.name, unit: p.unit, vendor: p.vendor, weekRequirement: p.requirement,
      availableAtWeekStart: p.availableAtWeekStart, incomingDuringWeek: p.incomingDuringWeek, shortfall: round(-p.minBalance), firstShortDate: p.firstShortDate!,
      earliestDelivery: projection.earliestDelivery, purchasableInTime: projection.earliestDelivery <= p.firstShortDate!,
    }))
    .sort((a, b) => a.firstShortDate.localeCompare(b.firstShortDate) || b.shortfall - a.shortfall);
}

export function residentConstraints(s: KitchenState) {
  const allergens: Record<string, number> = {};
  const diets: Record<string, number> = {};
  let halal = 0;
  let vegan = 0;
  let restricted = 0;
  for (const r of s.residents) {
    const care = `${r.careProfile?.["Diet Type"] ?? ""} ${r.careProfile?.["Religious/Cultural Requirements"] ?? ""}`.toLowerCase();
    const isHalal = care.includes("halal");
    const isVegan = /\bvegan\b/.test(care);
    for (const a of r.allergens) allergens[a] = (allergens[a] ?? 0) + 1;
    for (const d of r.diets) diets[d] = (diets[d] ?? 0) + 1;
    if (isHalal) halal++;
    if (isVegan) vegan++;
    if (r.allergens.length || r.diets.length || isHalal || isVegan) restricted++;
  }
  return { allergens, diets, halal, vegan, restricted };
}

const countList = (counts: Record<string, number>) =>
  Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, n]) => `${k} ${n}`).join(", ");

// ---------- Run lifecycle ----------

export type StartRefusal = "invalid-date" | "week-ended" | "week-approved" | "already-running";

export function canStartWeeklyWorkflow(s: KitchenState, date: string, reference = new Date()): StartRefusal | null {
  if (!isDateKey(date)) return "invalid-date";
  const start = weekStartFor(date);
  if (addDays(start, 6) < dateKey(reference)) return "week-ended";
  const id = weeklyPlanId(start);
  if (planFor(s, id)?.menuStatus === "approved") return "week-approved";
  if ((s.workflowRuns ?? []).some((r) => r.serviceWeekId === id && r.status === "running")) return "already-running";
  return null;
}

/** Starts a run for the week containing `date`; refuses overlapping runs for the same week. */
export function startWeeklyWorkflow(s: KitchenState, date: string, reference = new Date()): KitchenState {
  if (canStartWeeklyWorkflow(s, date, reference)) return s;
  const startDate = weekStartFor(date);
  const weekId = weeklyPlanId(startDate);
  let next: KitchenState = planFor(s, weekId) ? s : { ...s, weeklyPlans: sortWeeklyPlans([...(s.weeklyPlans ?? []), createWeeklyPlan(startDate, reference)]) };
  const now = reference.getTime();
  const runId = `run-${weekId}-${now}`;
  if ((next.workflowRuns ?? []).some((r) => r.workflowRunId === runId)) return s;
  // A new run replaces the week's previous unfinished review.
  const runs = (next.workflowRuns ?? []).map((r) => (r.serviceWeekId === weekId && r.status === "awaiting-approval" ? { ...r, status: "superseded" as const, finishedAt: now, updatedAt: now } : r));
  const run: WorkflowRun = { workflowRunId: runId, serviceWeekId: weekId, status: "running", step: 0, startedAt: now, updatedAt: now, finishedAt: null };
  const forWeek = [...runs.filter((r) => r.serviceWeekId === weekId), run].sort((a, b) => b.startedAt - a.startedAt);
  const dropped = new Set(forWeek.slice(RUNS_KEPT_PER_WEEK).map((r) => r.workflowRunId));
  next = {
    ...next,
    selectedWeekId: weekId,
    workflowRuns: [...runs, run].filter((r) => !dropped.has(r.workflowRunId)),
    agentEvents: (next.agentEvents ?? []).filter((e) => !dropped.has(e.workflowRunId)),
  };
  return updatePlan(next, weekId, (p) => applyWeeklyStatus(p, { menuStatus: "generating" }, reference) ?? p);
}

/** Executes the next orchestration step of a running workflow. */
export function advanceWeeklyWorkflow(s: KitchenState, runId: string, reference = new Date()): KitchenState {
  const run = s.workflowRuns?.find((r) => r.workflowRunId === runId);
  if (!run || run.status !== "running") return s;
  const plan = planFor(s, run.serviceWeekId);
  const now = reference.getTime();
  if (!plan || plan.menuStatus === "approved" || plan.endDate < dateKey(reference)) {
    return updateRun(s, runId, { status: "stopped", finishedAt: now, updatedAt: now, stopReason: !plan ? "The service week no longer exists." : plan.menuStatus === "approved" ? "The week was approved before the run finished." : "The service week has ended." });
  }
  const step = run.step + 1;
  const steps = [dietaryReview, menuGeneration, inventoryCheck, revisionsAndPurchasing, validationRerun, pauseForReview] as const;
  const next = steps[step - 1]!(s, run, plan, reference);
  const finished = step >= WORKFLOW_STEPS;
  return updateRun(next, runId, { step, updatedAt: now, ...(finished ? { status: "awaiting-approval" as const } : {}) });
}

type Step = (s: KitchenState, run: WorkflowRun, plan: WeeklyPlan, reference: Date) => KitchenState;

// Step 1 — Dietary Agent reads every resident profile.
const dietaryReview: Step = (s, run, plan, reference) => {
  const c = residentConstraints(s);
  const facts = [
    `${plural(s.residents.length, "resident profile")} reviewed`,
    `${c.restricted} with at least one documented restriction`,
    ...(Object.keys(c.allergens).length ? [`Allergies: ${countList(c.allergens)}`] : []),
    ...(Object.keys(c.diets).length ? [`Diet and texture: ${countList(c.diets)}`] : []),
    ...(c.halal || c.vegan ? [`Care profile requirements: ${[c.halal ? `halal ${c.halal}` : "", c.vegan ? `vegan ${c.vegan}` : ""].filter(Boolean).join(", ")}`] : []),
  ];
  return appendEvents(s, run, [{
    sendingAgent: "dietary", receivingAgent: "menu", action: "share-dietary-constraints", stage: 1, status: "completed",
    summary: `Constraints for ${plural(c.restricted, "resident")} with restrictions apply to all 21 meal slots for ${dayLabel(plan.startDate)}–${dayLabel(plan.endDate)}.`,
    structuredPayload: { kind: "dietary-constraints", facts, residentsTotal: s.residents.length, restrictedResidents: c.restricted, allergens: c.allergens, diets: c.diets, halal: c.halal, vegan: c.vegan },
    result: "Menu generation scores each catalog dish by how many residents it is safe for, using the same conflict rules as the daily menu.",
  }], reference);
};

// Step 2 — Menu Agent fills unsaved slots and computes ingredient requirements.
const menuGeneration: Step = (s, run, plan, reference) => {
  const before = weeklyMenu(s, plan.id, reference);
  let next = generateWeeklyMenu(s, plan.id, reference);
  next = updatePlan(next, plan.id, (p) => (p.menuStatus === "needs-review" ? applyWeeklyStatus(p, { menuStatus: "generating" }, reference) ?? p : p));
  const after = weeklyMenu(next, plan.id, reference);
  const generated = after.slots.filter((x, i) => x.source === "saved" && before.slots[i]!.source === "rotation").length;
  const kept = before.slots.filter((x) => x.source === "saved").length;
  const locked = after.slots.filter((x) => x.lock).length;
  const alternativesInPlace = after.slots.reduce((n, x) => n + Object.keys(x.overrides).length, 0);
  const pending = after.slots.reduce((n, x) => n + x.pendingAlternatives, 0);
  const unresolved = after.slots.reduce((n, x) => n + x.unresolved, 0);
  const projection = projectWeekInventory(next, plan, reference);
  const requirements = [...projection.ingredients.values()].filter((p) => p.requirement > 0)
    .sort((a, b) => b.requirement - a.requirement).map((p) => ({ ingredientId: p.ingredientId, name: p.name, unit: p.unit, qty: p.requirement }));
  const facts = [
    `${generated} meals generated from the recipe catalog; ${kept} previously saved meals kept`,
    ...(locked ? [`${locked} slots locked (past days or approved meals) and left unchanged`] : []),
    `${alternativesInPlace} resident alternatives already in place; ${pending} proposed for approval; ${unresolved} without a safe option`,
    `${plural(requirements.length, "ingredient")} needed across ${projection.dates.length} remaining service days`,
    ...requirements.slice(0, 5).map((r) => `${r.name}: ${qty(r.qty, r.unit)}`),
  ];
  return appendEvents(next, run, [{
    sendingAgent: "menu", receivingAgent: "inventory", action: "send-ingredient-requirements", stage: 2, status: "completed",
    summary: `Weekly menu drafted: ${after.slots.filter((x) => x.source === "saved" || x.lock === "past").length} of 21 meals planned. Please check stock for ${plural(requirements.length, "ingredient")} including resident alternatives.`,
    structuredPayload: { kind: "ingredient-requirements", facts, generatedSlots: generated, keptSlots: kept, lockedSlots: locked, alternativesInPlace, alternativesPending: pending, unresolved, requirements },
    result: "Inventory Agent projects stock against these requirements, after earlier planned meals and scheduled deliveries.",
  }], reference);
};

// Step 3 — Inventory Agent projects stock and reports shortages.
const inventoryCheck: Step = (s, run, plan, reference) => {
  const projection = projectWeekInventory(s, plan, reference);
  const shortages = weekShortages(projection);
  if (!shortages.length) {
    const checked = [...projection.ingredients.values()].filter((p) => p.requirement > 0).length;
    return appendEvents(s, run, [{
      sendingAgent: "inventory", receivingAgent: "menu", action: "confirm-stock", stage: 3, status: "completed",
      summary: `Projected stock and scheduled deliveries cover all ${plural(checked, "ingredient")} this week's menu needs.`,
      structuredPayload: { kind: "stock-confirmed", facts: [`${plural(checked, "ingredient")} checked`, `${(s.orders ?? []).filter((o) => o.status === "incoming").length} incoming orders included`], ingredientsChecked: checked },
      result: "No revisions or purchases needed for stock.",
    }], reference);
  }
  const menu = weeklyMenu(s, plan.id, reference);
  const lead = Math.max(1, s.leadTimeDays ?? 2);
  const events: NewEvent[] = [];
  const purchasable = shortages.filter((f) => f.purchasableInTime);
  if (purchasable.length) {
    events.push({
      sendingAgent: "inventory", receivingAgent: "menu", action: "report-shortage", stage: 3, status: "completed",
      summary: `${plural(purchasable.length, "ingredient")} will run short this week, but each can be delivered before it is first needed (${lead}-day lead time). The menu can stay as planned; I'll draft purchasing.`,
      structuredPayload: { kind: "purchasable-shortages", findings: purchasable, facts: purchasable.slice(0, 6).map((f) => `${f.name}: short ${qty(f.shortfall, f.unit)} from ${dayLabel(f.firstShortDate)}`) },
      result: "No menu change needed for these; they move to the purchase recommendation.",
    });
  }
  // A real conflict: stock runs out before any new order could arrive.
  for (const f of shortages.filter((x) => !x.purchasableInTime)) {
    const slots = menu.slots
      .map((x) => ({ date: x.date, meal: x.meal, dishName: x.dishName, qty: projection.slotUse.get(`${x.date}|${x.meal}`)?.[f.ingredientId] ?? 0, lock: x.lock }))
      .filter((x) => x.qty > 0);
    // Revise the earliest unlocked meal that can't be supplied in time, using the most of it.
    const top = [...slots].sort((a, b) =>
      Number(!!a.lock) - Number(!!b.lock) || Number(a.date >= f.earliestDelivery) - Number(b.date >= f.earliestDelivery) || b.qty - a.qty || a.date.localeCompare(b.date))[0];
    events.push({
      sendingAgent: "inventory", receivingAgent: "menu", action: "report-shortage", stage: 3, status: "warning",
      summary: top
        ? `${slotLabel(top.date, top.meal)} (${top.dishName}) needs ${qty(top.qty, f.unit)} of ${f.name.toLowerCase()}, but stock runs out ${dayLabel(f.firstShortDate)} and a new order can't arrive before ${dayLabel(f.earliestDelivery)}. Please propose an alternative.`
        : `${f.name} runs out ${dayLabel(f.firstShortDate)}, before a new order could arrive.`,
      structuredPayload: {
        kind: "shortage", finding: f, slots: slots.map(({ lock: _lock, ...x }) => x),
        facts: [
          `Week requirement: ${qty(f.weekRequirement, f.unit)}`,
          `Projected on hand at week start: ${qty(f.availableAtWeekStart, f.unit)}`,
          `Scheduled deliveries during the week: ${qty(f.incomingDuringWeek, f.unit)}`,
          `Shortfall: ${qty(f.shortfall, f.unit)}, first short on ${dayLabel(f.firstShortDate)}`,
          `Earliest new delivery: ${dayLabel(f.earliestDelivery)} (${lead}-day lead time)`,
          `Used in ${plural(slots.length, "meal")} this week`,
        ],
      },
      ...(top ? { affectedDate: top.date, affectedMeal: top.meal } : {}),
      result: "Menu Agent will look for a catalog dish without this ingredient; Inventory Agent will draft a purchase for the rest of the week.",
    });
  }
  return appendEvents(s, run, events, reference);
};

/**
 * Next catalog dish for a slot that avoids the ingredients it can't be supplied with, earlier
 * proposals, and dishes already used or proposed elsewhere this week.
 */
function revisionCandidate(s: KitchenState, plan: WeeklyPlan, date: string, meal: Meal, avoidIngredients: string[], alreadyProposed: string[], reference: Date, alsoUsed: string[] = []) {
  const menu = weeklyMenu(s, plan.id, reference);
  const slot = menu.slots.find((x) => x.date === date && x.meal === meal);
  if (!slot) return { slot, dish: undefined };
  const avoid = DISHES.filter((d) => d.ingredients.some((i) => avoidIngredients.includes(i.id))).map((d) => d.id);
  const used = weekDishUsage(menu, (x) => x === slot);
  for (const id of alsoUsed) used.set(id, (used.get(id) ?? 0) + 1);
  const dish = chooseDish(s, meal, used, slotRotation(plan.startDate, daysBetween(plan.startDate, date), meal) + alreadyProposed.length + 1, [slot.dishId, ...avoid, ...alreadyProposed]);
  return { slot, dish };
}

/** Shortages that are real menu conflicts (cannot be delivered in time). */
const shortagesOf = (events: AgentEvent[]) => events.flatMap((e) => (e.structuredPayload.kind === "shortage" ? [{ event: e, finding: e.structuredPayload.finding }] : []));
/** Every shortage found this run, conflicts and purchasable ones alike. */
const allFindings = (events: AgentEvent[]) => events.flatMap((e) =>
  e.structuredPayload.kind === "shortage" ? [e.structuredPayload.finding] : e.structuredPayload.kind === "purchasable-shortages" ? e.structuredPayload.findings : []);
/** Conflict ingredients reported against one slot. */
const conflictIngredientsFor = (events: AgentEvent[], date: string, meal: Meal) =>
  shortagesOf(events).filter((x) => x.event.affectedDate === date && x.event.affectedMeal === meal).map((x) => x.finding.ingredientId);
/** Dishes currently proposed and still awaiting a decision (so two slots never get the same proposal). */
const openProposalDishes = (events: AgentEvent[], except?: string) => {
  const decided = new Set(events.flatMap((e) => (e.structuredPayload.kind === "decision" ? [e.structuredPayload.proposalEventId] : [])));
  return events.flatMap((e) => (e.structuredPayload.kind === "revision" && !decided.has(e.eventId) && e.eventId !== except ? [e.structuredPayload.proposal.toDishId] : []));
};

function proposalEvent(proposal: RevisionProposal): NewEvent {
  return {
    sendingAgent: "menu", receivingAgent: "dietary", action: "propose-revision", stage: 4, status: "pending",
    summary: `Proposed replacing ${proposal.fromDishName} with ${proposal.toDishName} for ${slotLabel(proposal.date, proposal.meal)} to avoid the ${proposal.ingredientName.toLowerCase()} shortage. Please recheck resident requirements.`,
    structuredPayload: { kind: "revision", proposal, facts: [`Original: ${proposal.fromDishName}`, `Proposed: ${proposal.toDishName}`, `Removes ${proposal.ingredientName.toLowerCase()} from this meal's main dish`, "Chosen by catalog rules: most residents safe, no repeats this week"] },
    affectedDate: proposal.date, affectedMeal: proposal.meal,
    result: "Awaiting dietary and inventory revalidation, then your decision. Nothing changes until you approve.",
  };
}

// Step 4 — Menu Agent proposes revisions; Inventory Agent drafts purchasing.
const revisionsAndPurchasing: Step = (s, run, plan, reference) => {
  const runSoFar = runEvents(s, run.workflowRunId);
  const shortages = shortagesOf(runSoFar);
  const findings = allFindings(runSoFar);
  if (!findings.length) return s;
  const events: NewEvent[] = [];
  const revised = new Set<string>();
  const proposedThisStep: string[] = [];
  for (const { event, finding } of shortages) {
    const date = event.affectedDate;
    const meal = event.affectedMeal;
    const key = `${date}|${meal}`;
    if (!date || !meal || revised.has(key)) continue;
    const { slot, dish } = revisionCandidate(s, plan, date, meal, conflictIngredientsFor(runSoFar, date, meal), [], reference, proposedThisStep);
    if (!slot || slot.lock || !dish) {
      const reason = !slot ? "The affected meal is outside this week." : slot.lock ? `${slotLabel(date, meal)} is locked (${slot.lock.replace("-", " ")}).` : `No other ${meal} dish in the catalog avoids the short ingredients.`;
      events.push({
        sendingAgent: "menu", receivingAgent: "inventory", action: "propose-revision", stage: 4, status: "warning",
        summary: `No menu revision for the ${finding.name.toLowerCase()} shortage: ${reason}`,
        structuredPayload: { kind: "revision-unavailable", ingredientId: finding.ingredientId, reason, facts: [reason, "The purchase recommendation must cover this shortfall."] },
        affectedDate: date, affectedMeal: meal, result: "Purchasing recommended instead.",
      });
      continue;
    }
    revised.add(key);
    proposedThisStep.push(dish.id);
    events.push(proposalEvent({ date, meal, fromDishId: slot.dishId, fromDishName: slot.dishName, toDishId: dish.id, toDishName: dish.name, ingredientId: finding.ingredientId, ingredientName: finding.name }));
  }
  const lines = findings.map((finding): PurchaseRecommendationLine => {
    const ing = s.ingredients.find((i) => i.id === finding.ingredientId);
    const pack = ing?.packSize && ing.packSize > 0 ? ing.packSize : 1;
    const q = round(Math.ceil(finding.shortfall / pack - 1e-9) * pack);
    return { ingredientId: finding.ingredientId, name: finding.name, unit: finding.unit, vendor: finding.vendor, shortfall: finding.shortfall, qty: q, cost: lineCost(s, finding.ingredientId, q) };
  });
  const total = round(lines.reduce((n, l) => n + l.cost, 0));
  const vendors = [...new Set(lines.map((l) => l.vendor))];
  const orderByDate = lifecycleDates(plan.startDate, s.leadTimeDays ?? 2).purchasingDueDate;
  const neededBy = findings.map((f) => f.firstShortDate).sort()[0]!;
  const approveBy = orderByDate < dateKey(reference) ? "approve as soon as possible (the purchasing deadline has passed)" : `approve by ${dayLabel(orderByDate)}`;
  events.push({
    sendingAgent: "inventory", receivingAgent: "manager", action: "recommend-purchase", stage: 4, status: "pending",
    summary: `Draft purchase list: ${plural(lines.length, "line")} from ${plural(vendors.length, "vendor")}, estimated ${money(total)}. Needed by ${dayLabel(neededBy)}; ${approveBy}.`,
    structuredPayload: { kind: "purchase", lines, total, orderByDate, neededBy, vendors, facts: lines.map((l) => `${l.name}: order ${qty(l.qty, l.unit)} (short ${qty(l.shortfall, l.unit)}) from ${l.vendor} · ${money(l.cost)}`) },
    result: "Draft only. No order has been placed. Quantities cover the full shortfall in case revisions are declined.",
  });
  return appendEvents(s, run, events, reference);
};

function revalidate(s: KitchenState, plan: WeeklyPlan, proposalEvent: AgentEvent, reference: Date): NewEvent[] {
  if (proposalEvent.structuredPayload.kind !== "revision") return [];
  const p = proposalEvent.structuredPayload.proposal;
  const trial = setWeeklySlotDish(s, plan.id, p.date, p.meal, p.toDishId, reference);
  if (trial === s) return [];
  const offset = daysBetween(dateKey(reference), p.date);
  const count = (state: KitchenState) => {
    const conflicts = analyzeMenuDay(state, offset, reference).conflicts.filter((c) => c.meal === p.meal);
    return { pending: conflicts.filter((c) => c.status === "proposal-pending").length, unresolved: conflicts.filter((c) => c.status === "needs-staff").length, safe: state.residents.length - conflicts.length };
  };
  const before = count(s);
  const after = count(trial);
  const unsafeMain = s.residents.filter((r) => conflictReasons(r, dishById(p.toDishId)).length > 0).length;
  const dietaryPassed = after.unresolved <= before.unresolved;
  const beforeProj = projectWeekInventory(s, plan, reference);
  const afterProj = projectWeekInventory(trial, plan, reference);
  const shortBefore = new Map(weekShortages(beforeProj).map((f) => [f.ingredientId, f]));
  const shortAfter = weekShortages(afterProj);
  const target = shortAfter.find((f) => f.ingredientId === p.ingredientId);
  const added = shortAfter.filter((f) => !shortBefore.has(f.ingredientId));
  // New needs that can still be ordered in time are purchasing, not conflicts.
  const introduced = added.filter((f) => !f.purchasableInTime);
  const toPurchase = added.filter((f) => f.purchasableInTime);
  const was = shortBefore.get(p.ingredientId)?.shortfall ?? 0;
  const now = target?.shortfall ?? 0;
  const unit = shortBefore.get(p.ingredientId)?.unit ?? "";
  const inventoryPassed = introduced.length === 0;
  return [
    {
      sendingAgent: "dietary", receivingAgent: "inventory", action: "revalidate-dietary", stage: 4, status: dietaryPassed ? "completed" : "warning",
      summary: dietaryPassed
        ? `${p.toDishName} passes the deterministic dietary checks for ${slotLabel(p.date, p.meal)}: ${after.safe} of ${s.residents.length} residents served safely, ${after.pending} with an alternative pending approval.`
        : `${p.toDishName} leaves ${after.unresolved} residents without a safe option (previously ${before.unresolved}).`,
      structuredPayload: { kind: "revalidation", proposalEventId: proposalEvent.eventId, passed: dietaryPassed, facts: [
        `${unsafeMain} residents cannot have ${p.toDishName} as the main dish`,
        `Served safely: ${after.safe} (was ${before.safe})`,
        `Alternatives pending approval: ${after.pending} (was ${before.pending})`,
        `Without a safe option: ${after.unresolved} (was ${before.unresolved})`,
      ] },
      affectedDate: p.date, affectedMeal: p.meal,
      result: dietaryPassed ? "Dietary revalidation passed." : "Dietary revalidation flagged residents for staff review.",
    },
    {
      sendingAgent: "inventory", receivingAgent: "menu", action: "revalidate-inventory", stage: 4, status: inventoryPassed ? "completed" : "warning",
      summary: `With ${p.toDishName}, the ${p.ingredientName.toLowerCase()} shortfall goes from ${qty(was, unit)} to ${qty(now, unit)}${introduced.length ? `, but it creates shortages that can't be delivered in time: ${introduced.map((f) => f.name.toLowerCase()).join(", ")}` : ", with no new conflicts"}.`,
      structuredPayload: { kind: "revalidation", proposalEventId: proposalEvent.eventId, passed: inventoryPassed, facts: [
        `${p.ingredientName} shortfall: ${qty(was, unit)} → ${qty(now, unit)}`,
        introduced.length ? `New conflicts: ${introduced.map((f) => `${f.name} ${qty(f.shortfall, f.unit)}`).join(", ")}` : "No new conflicts introduced",
        ...(toPurchase.length ? [`Would add to purchasing (deliverable in time): ${toPurchase.map((f) => `${f.name} ${qty(f.shortfall, f.unit)}`).join(", ")}`] : []),
      ] },
      affectedDate: p.date, affectedMeal: p.meal,
      result: inventoryPassed ? "Inventory revalidation passed." : "Inventory revalidation found new shortages; review before approving.",
    },
  ];
}

// Step 5 — rerun dietary and inventory checks on each proposal and on the whole week.
const validationRerun: Step = (s, run, plan, reference) => {
  const events = runEvents(s, run.workflowRunId);
  const checks = events.filter((e) => e.structuredPayload.kind === "revision").flatMap((e) => revalidate(s, plan, e, reference));
  const menu = weeklyMenu(s, plan.id, reference);
  const unresolvedSlots = menu.slots.filter((x) => x.unresolved > 0);
  const pending = menu.slots.reduce((n, x) => n + x.pendingAlternatives, 0);
  const firstUnresolved = unresolvedSlots[0];
  checks.push({
    sendingAgent: "dietary", receivingAgent: "menu", action: "validate-week", stage: 4, status: unresolvedSlots.length ? "warning" : "completed",
    summary: unresolvedSlots.length
      ? `${plural(unresolvedSlots.length, "meal")} still have residents without a safe option on file. Staff decision needed.`
      : `Every resident has a safe served or proposed dish in all 21 meals.`,
    structuredPayload: { kind: "week-validation", unresolved: unresolvedSlots.length, pendingAlternatives: pending, residentsCovered: menu.residentsCovered, residentsTotal: menu.residentsTotal, facts: [
      `Residents covered in every meal: ${menu.residentsCovered} of ${menu.residentsTotal}`,
      `Resident alternatives awaiting approval: ${pending}`,
      ...unresolvedSlots.slice(0, 4).map((x) => `${slotLabel(x.date, x.meal)} (${x.dishName}): ${plural(x.unresolved, "resident")} without a safe option`),
    ] },
    ...(firstUnresolved ? { affectedDate: firstUnresolved.date, affectedMeal: firstUnresolved.meal } : {}),
    result: unresolvedSlots.length ? "Flagged for the manager; these cannot be resolved automatically." : "Dietary validation passed for the week.",
  });
  return appendEvents(s, run, checks, reference);
};

export function pendingRevisions(s: KitchenState, runId: string): AgentEvent[] {
  const events = runEvents(s, runId);
  const decided = new Set(events.flatMap((e) => (e.structuredPayload.kind === "decision" ? [e.structuredPayload.proposalEventId] : [])));
  return events.filter((e) => e.structuredPayload.kind === "revision" && !decided.has(e.eventId));
}

// Step 6 — pause for the kitchen manager.
const pauseForReview: Step = (s, run, plan, reference) => {
  const events = runEvents(s, run.workflowRunId);
  const menu = weeklyMenu(s, plan.id, reference);
  const pendingRevs = pendingRevisions(s, run.workflowRunId);
  const conflicts = shortagesOf(events).length;
  const shortages = allFindings(events).length;
  const purchase = events.find((e) => e.structuredPayload.kind === "purchase");
  const purchaseTotal = purchase?.structuredPayload.kind === "purchase" ? purchase.structuredPayload.total : 0;
  const pendingAlternatives = menu.slots.reduce((n, x) => n + x.pendingAlternatives, 0);
  const next = updatePlan(s, plan.id, (p) => (p.menuStatus === "generating" || p.menuStatus === "not-started" ? applyWeeklyStatus(p, { menuStatus: "needs-review" }, reference) ?? p : p));
  return appendEvents(next, run, [{
    sendingAgent: "team", receivingAgent: "manager", action: "request-approval", stage: 5, status: "pending",
    summary: `The weekly plan is ready for review: ${menu.slots.filter((x) => x.source === "saved" || x.lock === "past").length} of 21 meals planned, ${plural(pendingRevs.length, "proposed revision")} to decide${shortages ? `, and a draft purchase for ${plural(shortages, "ingredient")}` : ""}.`,
    structuredPayload: { kind: "review-request", pendingRevisions: pendingRevs.map((e) => e.eventId), shortages, purchaseTotal, facts: [
      `${plural(pendingRevs.length, "menu revision")} awaiting your decision`,
      `${plural(pendingAlternatives, "resident alternative")} awaiting approval in the Approval Center`,
      shortages ? `${plural(shortages, "ingredient")} to purchase (${conflicts} cannot arrive in time); draft estimated ${money(purchaseTotal)}, not ordered` : "No inventory shortages",
      "Automated checks do not replace clinical review of therapeutic diets",
    ] },
    result: "Workflow paused. The week is approved only by your decision.",
  }], reference);
};

// ---------- Manager decisions ----------

function decisionContext(s: KitchenState, eventId: string) {
  const event = s.agentEvents?.find((e) => e.eventId === eventId);
  const run = event && s.workflowRuns?.find((r) => r.workflowRunId === event.workflowRunId);
  const plan = run && planFor(s, run.serviceWeekId);
  if (!event || !run || !plan || run.status !== "awaiting-approval" || event.structuredPayload.kind !== "revision") return null;
  if (!pendingRevisions(s, run.workflowRunId).some((e) => e.eventId === eventId)) return null;
  return { event, run, plan, proposal: event.structuredPayload.proposal };
}

export function decideRevision(s: KitchenState, eventId: string, decision: "approve" | "decline", reference = new Date()): KitchenState {
  const ctx = decisionContext(s, eventId);
  if (!ctx) return s;
  const { run, plan, proposal: p } = ctx;
  const record = (state: KitchenState, status: "approved" | "rejected", summary: string): KitchenState => ({
    ...state,
    history: [{ proposalId: eventId, kind: "substitution", status, at: reference.getTime(), summary, modified: false }, ...state.history],
  });
  if (decision === "decline") {
    const summary = `Kept ${p.fromDishName} for ${slotLabel(p.date, p.meal)}; declined Menu Agent revision to ${p.toDishName}`;
    return appendEvents(record(s, "rejected", summary), run, [{
      sendingAgent: "manager", receivingAgent: "menu", action: "decline-revision", stage: 5, status: "completed",
      summary: `Kept ${p.fromDishName} for ${slotLabel(p.date, p.meal)}.`,
      structuredPayload: { kind: "decision", proposalEventId: eventId, decision: "declined", facts: [`Declined: ${p.toDishName}`, `The draft purchase still covers the ${p.ingredientName.toLowerCase()} shortfall`] },
      affectedDate: p.date, affectedMeal: p.meal, result: "Original meal kept; purchasing covers the shortfall.",
    }], reference);
  }
  // Apply through the shared schedule (keeps safe resident alternatives), then rerun the checks.
  const before = weekShortages(projectWeekInventory(s, plan, reference));
  const applied = setWeeklySlotDish(s, plan.id, p.date, p.meal, p.toDishId, reference);
  if (applied === s) return s;
  const slot = weeklyMenu(applied, plan.id, reference).slots.find((x) => x.date === p.date && x.meal === p.meal)!;
  const shortages = weekShortages(projectWeekInventory(applied, plan, reference));
  const after = shortages.find((f) => f.ingredientId === p.ingredientId);
  const known = new Set(before.map((f) => f.ingredientId));
  const newConflicts = shortages.filter((f) => !f.purchasableInTime && !known.has(f.ingredientId));
  const newPurchases = shortages.filter((f) => f.purchasableInTime && !known.has(f.ingredientId));
  const kept = Object.keys(slot.overrides).length;
  const next = record(applied, "approved", `Approved Menu Agent revision for ${slotLabel(p.date, p.meal)}: ${p.fromDishName} → ${p.toDishName}`);
  return appendEvents(next, run, [{
    sendingAgent: "manager", receivingAgent: "menu", action: "approve-revision", stage: 5, status: slot.unresolved || newConflicts.length ? "warning" : "completed",
    summary: `Approved ${p.toDishName} for ${slotLabel(p.date, p.meal)}, replacing ${p.fromDishName}.`,
    structuredPayload: { kind: "decision", proposalEventId: eventId, decision: "approved", facts: [
      `Saved to the daily menu for ${dayLabel(p.date)}`,
      `Dietary recheck: ${slot.residentsSafe} of ${applied.residents.length} residents served safely, ${slot.pendingAlternatives} alternatives pending approval, ${slot.unresolved} without a safe option`,
      `${plural(kept, "resident alternative")} kept for this meal`,
      after ? `${p.ingredientName} still short ${qty(after.shortfall, after.unit)}` : `${p.ingredientName} shortage resolved for this week`,
      ...(newConflicts.length ? [`New conflicts: ${newConflicts.map((f) => f.name).join(", ")}`] : []),
      ...(newPurchases.length ? [`Added to purchasing: ${newPurchases.map((f) => `${f.name} ${qty(f.shortfall, f.unit)}`).join(", ")}`] : []),
    ] },
    affectedDate: p.date, affectedMeal: p.meal,
    result: slot.unresolved
      ? "Menu updated, but some residents have no safe option for this meal; resolve before approving the week."
      : after ? "Menu updated; remaining shortfall stays on the purchasing list." : "Menu updated; this shortage no longer needs purchasing.",
  }], reference);
}

/** Asks the Menu Agent for the next catalog alternative, then revalidates it. */
export function requestAnotherRevision(s: KitchenState, eventId: string, reference = new Date()): KitchenState {
  const ctx = decisionContext(s, eventId);
  if (!ctx) return s;
  const { run, plan, proposal: p } = ctx;
  const events = runEvents(s, run.workflowRunId);
  const proposed = events.flatMap((e) => (e.structuredPayload.kind === "revision" && e.structuredPayload.proposal.date === p.date && e.structuredPayload.proposal.meal === p.meal ? [e.structuredPayload.proposal.toDishId] : []));
  const avoid = conflictIngredientsFor(events, p.date, p.meal);
  const { slot, dish } = revisionCandidate(s, plan, p.date, p.meal, avoid.length ? avoid : [p.ingredientId], proposed, reference, openProposalDishes(events, eventId));
  if (!slot || slot.lock || !dish) {
    if (events.some((e) => e.structuredPayload.kind === "revision-unavailable" && e.affectedDate === p.date && e.affectedMeal === p.meal && e.timestamp >= ctx.event.timestamp)) return s;
    const reason = `No other ${p.meal} dish in the catalog avoids the short ingredients.`;
    return appendEvents(s, run, [{
      sendingAgent: "menu", receivingAgent: "manager", action: "propose-revision", stage: 4, status: "warning",
      summary: `No further alternative for ${slotLabel(p.date, p.meal)}: ${reason}`,
      structuredPayload: { kind: "revision-unavailable", ingredientId: p.ingredientId, reason, facts: [reason, `${p.toDishName} remains the current proposal.`] },
      affectedDate: p.date, affectedMeal: p.meal, result: "Current proposal kept for your decision.",
    }], reference);
  }
  const replaced = appendEvents(s, run, [{
    sendingAgent: "manager", receivingAgent: "menu", action: "replace-revision", stage: 5, status: "completed",
    summary: `Requested another option instead of ${p.toDishName} for ${slotLabel(p.date, p.meal)}.`,
    structuredPayload: { kind: "decision", proposalEventId: eventId, decision: "replaced", facts: [`Replaced proposal: ${p.toDishName}`] },
    affectedDate: p.date, affectedMeal: p.meal, result: "Menu Agent proposed the next catalog option.",
  }], reference);
  const withProposal = appendEvents(replaced, run, [proposalEvent({ ...p, toDishId: dish.id, toDishName: dish.name })], reference);
  const newest = runEvents(withProposal, run.workflowRunId).at(-1)!;
  return appendEvents(withProposal, run, revalidate(withProposal, plan, newest, reference), reference);
}

// ---------- Weekly menu approval ----------

export type ApprovalBlockerCode =
  | "no-review" | "running" | "approved" | "unplanned-slots" | "pending-revisions" | "dietary-conflicts"
  | "pending-alternatives" | "rejected-meals" | "open-profile-updates" | "open-concerns";
export interface ApprovalBlocker {
  code: ApprovalBlockerCode;
  count: number;
  message: string;
  /** Where staff resolve it. */
  link?: "/approvals" | "/profile-updates" | "/residents";
}
export interface WeeklyApprovalChecks {
  ready: boolean;
  blockers: ApprovalBlocker[];
  /** Purchasing stays a separate task; it never blocks menu approval. */
  purchasingTasks: number;
}

/**
 * Live checks behind "Approve Weekly Menu". Past days are already served and are not rechecked.
 * Purchasing needs are reported but never block menu approval.
 */
export function weeklyApprovalChecks(s: KitchenState, weekId: string, reference = new Date()): WeeklyApprovalChecks {
  const plan = planFor(s, weekId);
  const run = latestRunFor(s, weekId);
  const blockers: ApprovalBlocker[] = [];
  const findings = run ? allFindings(runEvents(s, run.workflowRunId)).length : 0;
  if (plan?.menuStatus === "approved") return { ready: false, blockers: [{ code: "approved", count: 0, message: "This week's menu is already approved." }], purchasingTasks: findings };
  if (!run || run.status === "superseded" || run.status === "stopped") blockers.push({ code: "no-review", count: 0, message: "Generate the weekly plan so the agents can run their checks." });
  else if (run.status === "running") blockers.push({ code: "running", count: 0, message: "The agents are still running their checks." });
  const menu = weeklyMenu(s, weekId, reference);
  const open = menu.slots.filter((x) => x.lock !== "past");
  const unplanned = open.filter((x) => x.source !== "saved").length;
  if (unplanned) blockers.push({ code: "unplanned-slots", count: unplanned, message: `${plural(unplanned, "meal slot")} not yet planned; all 21 primary meals must exist.` });
  const revisions = run && run.status === "awaiting-approval" ? pendingRevisions(s, run.workflowRunId).length : 0;
  if (revisions) blockers.push({ code: "pending-revisions", count: revisions, message: `${plural(revisions, "menu revision")} awaiting your decision.` });
  const conflicts = open.filter((x) => x.unresolved > 0);
  if (conflicts.length) blockers.push({ code: "dietary-conflicts", count: conflicts.reduce((n, x) => n + x.unresolved, 0), message: `Critical dietary conflict: ${plural(conflicts.reduce((n, x) => n + x.unresolved, 0), "resident")} without a safe option across ${plural(conflicts.length, "meal")}.`, link: "/approvals" });
  const alternatives = open.reduce((n, x) => n + x.pendingAlternatives, 0);
  if (alternatives) blockers.push({ code: "pending-alternatives", count: alternatives, message: `${plural(alternatives, "resident alternative")} awaiting approval in the Approval Center.`, link: "/approvals" });
  const rejected = open.filter((x) => x.rejected).length;
  if (rejected) blockers.push({ code: "rejected-meals", count: rejected, message: `${plural(rejected, "meal")} rejected by staff and not yet replaced.` });
  const profiles = (s.profileUpdates ?? []).filter((u) => u.review === "open").length;
  if (profiles) blockers.push({ code: "open-profile-updates", count: profiles, message: `${plural(profiles, "resident care update")} not yet reviewed; meals were checked against them.`, link: "/profile-updates" });
  // Open concern observations about a dish a resident is served again this week.
  const served = new Set(open.flatMap((x) => s.residents.map((r) => `${r.id}|${x.overrides[r.id] ?? x.dishId}`)));
  const concerns = (s.observations ?? []).filter((o) => o.status === "open" && o.severity === "concern" && served.has(`${o.residentId}|${o.dishId}`)).length;
  if (concerns) blockers.push({ code: "open-concerns", count: concerns, message: `${plural(concerns, "open meal concern")} about dishes served again this week need review.`, link: "/residents" });
  return { ready: blockers.length === 0, blockers, purchasingTasks: findings };
}

/**
 * Records the manager's sign-off for the week's menu once every check passes. Per-meal sign-off
 * (existing approveMeal) is applied by the store before this. Purchasing approval is separate.
 */
export function approveWeeklyMenu(s: KitchenState, weekId: string, reference = new Date()): KitchenState {
  const run = latestRunFor(s, weekId);
  const plan = planFor(s, weekId);
  if (!run || !plan || !weeklyApprovalChecks(s, weekId, reference).ready) return s;
  const approved = applyWeeklyStatus(plan, { menuStatus: "approved" }, reference);
  if (!approved || approved === plan) return s;
  const menu = weeklyMenu(s, weekId, reference);
  const signatures = Object.fromEntries(menu.slots.filter((x) => x.lock !== "past").map((x) => [slotKey(x.date, x.meal), slotSignature(s, x.date, x.meal, reference)]));
  const { revalidationSlots: _cleared, ...rest } = approved;
  const now = reference.getTime();
  const range = `${dayLabel(plan.startDate)}–${dayLabel(plan.endDate)}`;
  let next = updatePlan(s, weekId, () => ({ ...rest, menuApprovalSignatures: signatures }));
  next = updateRun(next, run.workflowRunId, { status: "completed", finishedAt: now, updatedAt: now });
  next = { ...next, history: [{ proposalId: `week-approval-${weekId}-${now}`, kind: "substitution", status: "approved", at: now, summary: `Approved weekly menu for ${range}`, modified: false }, ...next.history] };
  const findings = allFindings(runEvents(s, run.workflowRunId));
  return appendEvents(next, run, [{
    sendingAgent: "manager", receivingAgent: "team", action: "approve-week", stage: 5, status: "completed",
    summary: `Weekly menu approved for ${range}.`,
    structuredPayload: { kind: "week-approved", facts: [
      `${menu.slots.filter((x) => x.source === "saved" || x.lock === "past").length} of 21 meals planned`,
      `${menu.residentsCovered} of ${menu.residentsTotal} residents covered in every meal`,
      findings.length ? `${plural(findings.length, "ingredient")} remain open purchasing tasks (approved separately)` : "No purchasing needs",
    ] },
    result: "Menu approved. Any later change to a meal or to resident requirements reopens it for revalidation.",
  }], reference);
}

/**
 * After any change, compare approved weeks against what was approved. Changed meals (or every
 * meal, when resident requirements change) are flagged for revalidation, the week returns to
 * review, and its latest run waits for renewed approval. `explicit` marks a staff edit or
 * rejection of a dated meal as a revision even if its content signature is unchanged.
 */
export function flagApprovedWeekChanges(s: KitchenState, explicit: { date: string; meal?: Meal | undefined } | undefined, reference = new Date()): KitchenState {
  const today = dateKey(reference);
  const approvedPlans = (s.weeklyPlans ?? []).filter((p) => p.menuStatus === "approved");
  if (!approvedPlans.length) return s;
  const residents = residentRequirementSignature(s);
  let next = s;
  for (const plan of approvedPlans) {
    const changed: string[] = [];
    let residentRequirementsChanged = false;
    for (const [key, signature] of Object.entries(plan.menuApprovalSignatures ?? {})) {
      const [date, meal] = key.split("|") as [string, Meal];
      if (date < today) continue;
      if (slotSignature(s, date, meal, reference) === signature) continue;
      changed.push(key);
      try { if ((JSON.parse(signature) as { residents?: string }).residents !== residents) residentRequirementsChanged = true; } catch { /* treat as a menu change */ }
    }
    if (explicit && isDateKey(explicit.date) && explicit.date >= today && weekStartFor(explicit.date) === plan.startDate) {
      for (const meal of explicit.meal ? [explicit.meal] : MEALS) if (!changed.includes(slotKey(explicit.date, meal))) changed.push(slotKey(explicit.date, meal));
    }
    if (!changed.length) continue;
    const reopened = applyWeeklyStatus(plan, { menuStatus: "needs-review" }, reference);
    if (!reopened) continue;
    next = updatePlan(next, plan.id, () => ({ ...reopened, revalidationSlots: [...new Set([...(plan.revalidationSlots ?? []), ...changed])].sort() }));
    const run = latestRunFor(next, plan.id);
    if (!run) continue;
    const now = reference.getTime();
    if (run.status === "completed") next = updateRun(next, run.workflowRunId, { status: "awaiting-approval", finishedAt: null, updatedAt: now });
    const labels = changed.slice(0, 6).map((k) => { const [d, m] = k.split("|") as [string, Meal]; return slotLabel(d, m); });
    next = appendEvents(next, { ...run, status: "awaiting-approval" }, [{
      sendingAgent: "team", receivingAgent: "manager", action: "revalidation-required", stage: 5, status: "warning",
      summary: residentRequirementsChanged
        ? `Resident dietary requirements changed after approval. All ${plural(changed.length, "remaining meal")} must be rechecked and the week re-approved.`
        : `${plural(changed.length, "approved meal")} changed after approval and must be rechecked before the week is re-approved.`,
      structuredPayload: { kind: "revalidation-required", slots: changed, residentRequirementsChanged, facts: [
        residentRequirementsChanged ? "Cause: a resident's allergies, diet or care-profile requirements changed" : "Cause: a meal, its alternatives or its sign-off changed",
        ...labels.map((l) => `Recheck ${l}`),
        ...(changed.length > labels.length ? [`…and ${changed.length - labels.length} more`] : []),
        ...(plan.purchasingStatus === "approved" ? ["Purchasing approval was withdrawn because it was based on the approved menu"] : []),
      ] },
      ...(labels.length === 1 ? { affectedDate: changed[0]!.split("|")[0]!, affectedMeal: changed[0]!.split("|")[1] as Meal } : {}),
      result: "Week returned to review. Previous approval no longer applies to the changed meals.",
    }], reference);
  }
  return next;
}

// ---------- Presentation helpers ----------

export type AgentActivity = "idle" | "working" | "waiting-agent" | "waiting-manager" | "completed" | "blocked";

export function agentActivity(run: WorkflowRun | undefined): Record<AgentRole, AgentActivity> {
  if (!run || run.status === "superseded") return { dietary: "idle", menu: "idle", inventory: "idle" };
  if (run.status === "stopped") return { dietary: "blocked", menu: "blocked", inventory: "blocked" };
  if (run.status === "completed") return { dietary: "completed", menu: "completed", inventory: "completed" };
  if (run.status === "awaiting-approval") return { dietary: "completed", menu: "waiting-manager", inventory: "completed" };
  switch (run.step + 1) {
    case 1: return { dietary: "working", menu: "idle", inventory: "idle" };
    case 2: return { dietary: "completed", menu: "working", inventory: "idle" };
    case 3: return { dietary: "completed", menu: "waiting-agent", inventory: "working" };
    case 4: return { dietary: "completed", menu: "working", inventory: "working" };
    case 5: return { dietary: "working", menu: "waiting-agent", inventory: "working" };
    default: return { dietary: "completed", menu: "waiting-agent", inventory: "completed" };
  }
}

// ---------- Migration ----------

/** Older saves get empty run/event lists; events whose run is gone are dropped. */
export function migrateAgentWorkflow(s: KitchenState): KitchenState {
  const runs = Array.isArray(s.workflowRuns) ? s.workflowRuns.filter((r) => r && typeof r.workflowRunId === "string" && typeof r.serviceWeekId === "string") : [];
  const ids = new Set(runs.map((r) => r.workflowRunId));
  const events = Array.isArray(s.agentEvents) ? s.agentEvents.filter((e) => e && ids.has(e.workflowRunId) && e.structuredPayload && typeof e.structuredPayload === "object") : [];
  return { ...s, workflowRuns: runs, agentEvents: events };
}
