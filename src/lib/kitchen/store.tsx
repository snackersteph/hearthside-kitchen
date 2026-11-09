import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type Context, type ReactNode } from "react";
import { initialState, dishById, INGREDIENTS, RESIDENT_PROFILE_VERSION, RESIDENTS } from "./data";
import { analyze, analyzeMenuDay, conflictReasons, dietarySignature, mealSignature, resolveMenuState, type Analysis } from "./engine";
import type { Ingredient, KitchenState, Meal, Observation, ProfileUpdate, PurchaseLine, Resident } from "./types";
import { canApproveMeal, dateKey, dayAt, scheduledState } from "./schedule";
import { ADDITIONAL_RESIDENTS } from "./additional-residents";
import { ADDITIONAL_INGREDIENTS, FOOD_CATEGORIES } from "./inventory-catalog";

type Action =
  | { type: "addResident"; resident: Resident }
  | { type: "deleteResident"; id: string }
  | { type: "addIngredient"; ingredient: Ingredient }
  | { type: "updateIngredient"; ingredient: Ingredient }
  | { type: "deleteIngredient"; id: string }
  | { type: "approveMeal"; date: string; meal: Meal }
  | { type: "rejectMeal"; date: string; meal: Meal }
  | { type: "setMealPlan"; date: string; meal: Meal; dishId: string; overrides: Record<string, string> }
  | { type: "setHorizon"; days: 7 | 14 }
  | { type: "setLeadTime"; days: number }
  | { type: "receiveOrder"; id: string }
  | { type: "load"; state: KitchenState }
  | { type: "reset" }
  | { type: "setMain"; meal: Meal; dishId: string }
  | { type: "setScheduledMain"; date: string; meal: Meal; dishId: string }
  | { type: "updateResident"; resident: Resident }
  | { type: "logObservation"; observation: Observation }
  | { type: "reviewObservation"; id: string }
  | { type: "markProfileUpdatesSeen" }
  | { type: "setStock"; id: string; stock: number }
  | { type: "approveSub"; proposalId: string; meal: Meal; dishId: string; residentIds: string[]; serviceDate?: string | undefined; modified: boolean; summary: string; remember?: boolean }
  | { type: "approvePurchase"; proposalId: string; lines: PurchaseLine[]; modified: boolean; summary: string; vendor?: string; deliveryDate?: string }
  | { type: "reject"; proposalId: string; kind: "substitution" | "purchase"; summary: string; serviceDate?: string | undefined; note?: string };

/** Which parts of a resident's care information a staff edit touched. */
export function profileChangeSummary(previous: Resident, next: Resident): string | null {
  const parts: string[] = [];
  if (previous.name !== next.name || previous.room !== next.room || previous.age !== next.age) parts.push("Basic information");
  if (previous.allergens.join("|") !== next.allergens.join("|")) parts.push("Food allergies");
  if (previous.diets.join("|") !== next.diets.join("|")) parts.push("Diet type");
  if (previous.notes !== next.notes) parts.push("Clinical notes");
  if (JSON.stringify(previous.careProfile ?? null) !== JSON.stringify(next.careProfile ?? null)) parts.push("Care profile");
  if ((previous.mealInstructions ?? []).join("|") !== (next.mealInstructions ?? []).join("|")) parts.push("Meal instructions");
  if (previous.photoUrl !== next.photoUrl) parts.push("Profile photo");
  return parts.length ? parts.join(", ") : null;
}

/** Records an open profile update whenever a staff edit changes a resident's care information. */
function profileUpdateRecord(previous: Resident, next: Resident, reference: Date): Pick<KitchenState, "profileUpdates"> {
  const summary = profileChangeSummary(previous, next);
  if (!summary) return {};
  return { profileUpdates: [{ id: `profile-${next.id}-${reference.getTime()}`, residentId: next.id, at: reference.getTime(), summary, review: "open" }, ...(previous ? [] : [])] };
}

export function reducer(s: KitchenState, a: Action, reference = new Date()): KitchenState {
  switch (a.type) {
    case "deleteResident": {
      if (!s.residents.some((r) => r.id === a.id)) return s;
      const clear = (meals: Partial<Record<Meal, Record<string, string>>>) => Object.fromEntries(Object.entries(meals).map(([meal, entries]) => [meal, Object.fromEntries(Object.entries(entries ?? {}).filter(([id]) => id !== a.id))]));
      return { ...s,
        residents: s.residents.filter((r) => r.id !== a.id),
        alternativePreferences: (s.alternativePreferences ?? []).filter((p) => p.residentId !== a.id),
        overrides: clear(s.overrides) as KitchenState["overrides"],
        scheduledOverrides: Object.fromEntries(Object.entries(s.scheduledOverrides ?? {}).map(([date, meals]) => [date, clear(meals)])),
      };
    }
    case "addResident": {
      if (!a.resident.name.trim() || !a.resident.room.trim() || !Number.isInteger(a.resident.age) || a.resident.age < 1 || a.resident.age > 120 || s.residents.some((r) => r.id === a.resident.id)) return s;
      return { ...s, residents: [...s.residents, { ...a.resident, name: a.resident.name.trim(), room: a.resident.room.trim() }] };
    }
    case "deleteIngredient": {
      if (!s.ingredients.some((i) => i.id === a.id)) return s;
      return { ...s, ingredients: s.ingredients.filter((i) => i.id !== a.id), deletedIngredientIds: [...(s.deletedIngredientIds ?? []), a.id], orders: (s.orders ?? []).map((o) => ({ ...o, lines: o.lines.filter((l) => l.ingredientId !== a.id) })).filter((o) => o.lines.length > 0) };
    }
    case "addIngredient":
    case "updateIngredient": {
      const i = a.ingredient;
      const previous = s.ingredients.find((x) => x.id === i.id);
      if (a.type === "updateIngredient" && !previous) return s;
      if (!i.name.trim() || !i.vendor.trim() || !["kg", "L", "each", ...(previous ? [previous.unit] : [])].includes(i.unit) || (previous && i.unit !== previous.unit) || !Number.isFinite(i.stock) || i.stock < 0 || !Number.isFinite(i.packSize) || i.packSize <= 0 || !Number.isFinite(i.unitCost) || i.unitCost < 0 || i.onOrder !== (previous?.onOrder ?? 0) || (i.category && !FOOD_CATEGORIES.includes(i.category)) || s.ingredients.some((x) => (a.type === "addIngredient" || x.id !== i.id) && (x.id === i.id || x.name.trim().toLowerCase() === i.name.trim().toLowerCase()))) return s;
      if (a.type === "updateIngredient") return { ...s, ingredients: s.ingredients.map((x) => x.id === i.id ? { ...i, name: i.name.trim(), vendor: i.vendor.trim() } : x) };
      return { ...s, ingredients: [...s.ingredients, { ...i, name: i.name.trim(), vendor: i.vendor.trim() }] };
    }
    case "setHorizon": return { ...s, purchaseHorizonDays: a.days };
    case "setLeadTime": return { ...s, leadTimeDays: Math.max(1, Math.min(14, Math.round(a.days) || 2)) };
    case "receiveOrder": {
      const order = s.orders?.find((o) => o.id === a.id && o.status === "incoming");
      if (!order) return s;
      return { ...s, orders: (s.orders ?? []).map((o) => o.id === a.id ? { ...o, status: "received" } : o), ingredients: s.ingredients.map((i) => {
        const qty = order.lines.filter((line) => line.ingredientId === i.id).reduce((sum, line) => sum + line.qty, 0);
        return { ...i, stock: i.stock + qty, onOrder: Math.max(0, i.onOrder - qty) };
      }) };
    }
    case "load": return a.state;
    case "reset": return seedDemo(initialState(), reference);
    case "setScheduledMain": {
      if (a.date <= dateKey(dayAt(0, reference)) || dishById(a.dishId).meal !== a.meal) return s;
      return { ...s,
        scheduledPlans: { ...s.scheduledPlans, [a.date]: { ...s.scheduledPlans?.[a.date], [a.meal]: a.dishId } },
        scheduledOverrides: { ...s.scheduledOverrides, [a.date]: { ...s.scheduledOverrides?.[a.date], [a.meal]: {} } },
        mealApprovals: { ...s.mealApprovals, [a.date]: { ...s.mealApprovals?.[a.date], [a.meal]: undefined } },
        history: s.history };
    }
    case "setMain": {
      const date = dateKey(reference);
      return { ...s, plan: { ...s.plan, [a.meal]: a.dishId }, scheduledPlans: { ...s.scheduledPlans, [date]: { ...s.scheduledPlans?.[date], [a.meal]: a.dishId } }, overrides: { ...s.overrides, [a.meal]: {} }, scheduledOverrides: { ...s.scheduledOverrides, [date]: { ...s.scheduledOverrides?.[date], [a.meal]: {} } }, mealApprovals: { ...s.mealApprovals, [date]: { ...s.mealApprovals?.[date], [a.meal]: undefined } } };
    }
    case "updateResident": {
      const previous = s.residents.find((r) => r.id === a.resident.id);
      if (!previous) return s;
      const changed = dietarySignature(previous) !== dietarySignature({ ...a.resident, dietaryRevision: previous.dietaryRevision ?? 0 });
      const resident = { ...a.resident, dietaryRevision: (previous.dietaryRevision ?? 0) + (changed ? 1 : 0) };
      if (!changed) return { ...s, residents: s.residents.map((r) => r.id === resident.id ? resident : r), ...profileUpdateRecord(previous, resident, reference) };
      const clear = (meals: Partial<Record<Meal, Record<string, string>>>) => Object.fromEntries(Object.entries(meals).map(([meal, entries]) => [meal, Object.fromEntries(Object.entries(entries ?? {}).filter(([id]) => id !== resident.id))]));
      const today = dateKey(reference);
      return { ...s, residents: s.residents.map((r) => r.id === resident.id ? resident : r),
        ...profileUpdateRecord(previous, resident, reference),
        alternativePreferences: (s.alternativePreferences ?? []).filter((p) => p.residentId !== resident.id),
        overrides: clear(s.overrides) as KitchenState["overrides"],
        scheduledOverrides: Object.fromEntries(Object.entries(s.scheduledOverrides ?? {}).map(([date, meals]) => [date, date >= today ? clear(meals) : meals])),
      };
    }
    case "logObservation": {
      const o = a.observation;
      if (!s.residents.some((r) => r.id === o.residentId) || dishById(o.dishId).meal !== o.meal || !o.reaction.trim()) return s;
      return { ...s, observations: [{ ...o, reaction: o.reaction.trim() }, ...(s.observations ?? [])] };
    }
    case "reviewObservation": {
      if (!(s.observations ?? []).some((o) => o.id === a.id)) return s;
      return { ...s, observations: (s.observations ?? []).map((o) => (o.id === a.id ? { ...o, status: "reviewed" } : o)) };
    }
    case "markProfileUpdatesSeen": {
      if (!(s.profileUpdates ?? []).some((u) => u.review === "open")) return s;
      return { ...s, profileUpdates: (s.profileUpdates ?? []).map((u) => ({ ...u, review: "seen" })) };
    }
    case "setStock": return { ...s, ingredients: s.ingredients.map((i) => (i.id === a.id ? { ...i, stock: Math.max(0, a.stock) } : i)) };
    case "setMealPlan": {
      if (a.date < dateKey(reference) || dishById(a.dishId).meal !== a.meal) return s;
      if (a.date === dateKey(reference) && analyze(s, reference).mealReviews?.some((r) => r.serviceDate === a.date && r.meal === a.meal && r.approved)) return s;
      if (Object.entries(a.overrides).some(([id, dishId]) => {
        const resident = s.residents.find((r) => r.id === id);
        const dish = dishById(dishId);
        return !resident || dish.meal !== a.meal || conflictReasons(resident, dish).length > 0;
      })) return s;
      return { ...s,
        scheduledPlans: { ...s.scheduledPlans, [a.date]: { ...s.scheduledPlans?.[a.date], [a.meal]: a.dishId } },
        scheduledOverrides: { ...s.scheduledOverrides, [a.date]: { ...s.scheduledOverrides?.[a.date], [a.meal]: a.overrides } },
        mealApprovals: { ...s.mealApprovals, [a.date]: { ...s.mealApprovals?.[a.date], [a.meal]: undefined } },
        mealRejections: { ...s.mealRejections, [a.date]: { ...s.mealRejections?.[a.date], [a.meal]: undefined } },
      };
    }
    case "rejectMeal": {
      if (a.date < dateKey(reference)) return s;
      const offset = Math.round((new Date(`${a.date}T12:00:00`).getTime() - new Date(`${dateKey(reference)}T12:00:00`).getTime()) / 86400000);
      const dayState = resolveMenuState(s, offset, reference);
      return { ...s,
        scheduledPlans: { ...s.scheduledPlans, [a.date]: { ...s.scheduledPlans?.[a.date], [a.meal]: dayState.plan[a.meal] } },
        mealApprovals: { ...s.mealApprovals, [a.date]: { ...s.mealApprovals?.[a.date], [a.meal]: undefined } },
        mealRejections: { ...s.mealRejections, [a.date]: { ...s.mealRejections?.[a.date], [a.meal]: { signature: mealSignature(dayState, a.meal), rejectedAt: reference.getTime() } } },
        history: [{ proposalId: `meal-reject-${a.date}-${a.meal}-${reference.getTime()}`, kind: "substitution", status: "rejected", at: reference.getTime(), serviceDate: a.date, summary: `Rejected ${a.meal} menu for ${a.date}`, modified: false }, ...s.history],
      };
    }
    case "approveMeal": {
      if (!canApproveMeal(a.date, reference)) return s;
      const offset = Math.round((new Date(`${a.date}T12:00:00`).getTime() - new Date(`${dateKey(reference)}T12:00:00`).getTime()) / 86400000);
      const dayState = resolveMenuState(s, offset, reference);
      if (analyzeMenuDay(s, offset, reference).conflicts.some((c) => c.meal === a.meal)) return s;
      const signature = mealSignature(dayState, a.meal);
      if (s.mealRejections?.[a.date]?.[a.meal]?.signature === signature) return s;
      return { ...s,
        scheduledPlans: { ...s.scheduledPlans, [a.date]: { ...s.scheduledPlans?.[a.date], [a.meal]: dayState.plan[a.meal] } },
        mealApprovals: { ...s.mealApprovals, [a.date]: { ...s.mealApprovals?.[a.date], [a.meal]: { signature, approvedAt: reference.getTime() } } },
        mealRejections: { ...s.mealRejections, [a.date]: { ...s.mealRejections?.[a.date], [a.meal]: undefined } },
        history: [{ proposalId: `meal-${a.date}-${a.meal}-${reference.getTime()}`, kind: "substitution", status: "approved", at: reference.getTime(), serviceDate: a.date, summary: `Approved ${a.meal} menu for ${a.date}`, modified: false }, ...s.history] };
    }
    case "approveSub": {
      if (!a.serviceDate || !canApproveMeal(a.serviceDate, reference)) return s;
      if (!a.residentIds.length || dishById(a.dishId).meal !== a.meal || a.residentIds.some((id) => {
        const resident = s.residents.find((r) => r.id === id);
        return !resident || conflictReasons(resident, dishById(a.dishId)).length > 0;
      })) return s;
      if (a.serviceDate) {
        const date = a.serviceDate;
        const o = { ...s.scheduledOverrides?.[date]?.[a.meal] };
        for (const id of a.residentIds) o[id] = a.dishId;
        const offset = Math.round((new Date(`${date}T12:00:00`).getTime() - new Date(`${dateKey(reference)}T12:00:00`).getTime()) / 86400000);
        const fromDishId = scheduledState(s, offset, reference).plan[a.meal];
        const preferences = a.remember ? [
          ...(s.alternativePreferences ?? []).filter((p) => !(p.meal === a.meal && p.fromDishId === fromDishId && a.residentIds.includes(p.residentId))),
          ...a.residentIds.flatMap((residentId) => { const resident = s.residents.find((r) => r.id === residentId); return resident ? [{ residentId, meal: a.meal, fromDishId, dishId: a.dishId, dietarySignature: dietarySignature(resident) }] : []; }),
        ] : s.alternativePreferences?.filter((p) => !(p.meal === a.meal && p.fromDishId === fromDishId && a.residentIds.includes(p.residentId) && p.dishId !== a.dishId));
        return { ...s, scheduledPlans: { ...s.scheduledPlans, [date]: { ...s.scheduledPlans?.[date], [a.meal]: scheduledState(s, offset, reference).plan[a.meal] } },
          ...(preferences ? { alternativePreferences: preferences } : {}),
          scheduledOverrides: { ...s.scheduledOverrides, [date]: { ...s.scheduledOverrides?.[date], [a.meal]: o } },
          mealApprovals: { ...s.mealApprovals, [date]: { ...s.mealApprovals?.[date], [a.meal]: undefined } },
          history: [{ proposalId: a.proposalId, kind: "substitution", status: "approved", at: reference.getTime(), serviceDate: date, summary: a.summary, modified: a.modified }, ...s.history] };
      }
      const o = { ...s.overrides[a.meal] };
      for (const id of a.residentIds) o[id] = a.dishId;
      return { ...s, overrides: { ...s.overrides, [a.meal]: o }, history: [{ proposalId: a.proposalId, kind: "substitution", status: "approved", at: Date.now(), summary: a.summary, modified: a.modified }, ...s.history] };
    }
    case "approvePurchase":
      return {
        ...s,
        orders: [...(s.orders ?? []), { id: `${a.proposalId}-${s.history.length}`, vendor: a.vendor ?? s.ingredients.find((i) => i.id === a.lines[0]?.ingredientId)?.vendor ?? "Supplier", lines: a.lines, deliveryDate: a.deliveryDate ?? dateKey(dayAt(Math.max(1, s.leadTimeDays ?? 2))), status: "incoming" }],
        ingredients: s.ingredients.map((i) => { const l = a.lines.find((x) => x.ingredientId === i.id); return l ? { ...i, onOrder: i.onOrder + l.qty } : i; }),
        history: [{ proposalId: a.proposalId, kind: "purchase", status: "approved", at: Date.now(), summary: a.summary, modified: a.modified }, ...s.history],
      };
    case "reject":
      return { ...s, history: [{ proposalId: a.proposalId, kind: a.kind, status: "rejected", at: Date.now(), summary: a.summary, modified: false, ...(a.serviceDate ? { serviceDate: a.serviceDate } : {}), ...(a.note ? { note: a.note } : {}) }, ...s.history] };
  }
}

/** Demo seed: signs off a few upcoming services and adds past decisions so every tab has examples. */
export function seedDemo(base: KitchenState, reference = new Date()): KitchenState {
  let s: KitchenState = { ...base, seeded: true };
  const day = 86400000;
  for (const offset of [2, 3, 4]) {
    const date = dateKey(dayAt(offset, reference));
    for (const p of analyze(s, reference).proposals) {
      if (p.kind === "substitution" && p.serviceDate === date) s = reducer(s, { type: "approveSub", proposalId: p.id, meal: p.meal, dishId: p.dishId, residentIds: p.residentIds, serviceDate: date, modified: false, summary: `Approved ${date} ${p.meal} swap to ${dishById(p.dishId).name}` }, reference);
    }
    for (const meal of ["breakfast", "lunch", "dinner"] as Meal[]) s = reducer(s, { type: "approveMeal", date, meal }, reference);
  }
  const past = [1, 2, 4, 6, 9, 12, 18, 25].map((ago, i): KitchenState["history"][number] => {
    const date = dateKey(dayAt(-ago, reference));
    const meal = (["breakfast", "lunch", "dinner"] as Meal[])[i % 3]!;
    return i % 4 === 3
      ? { proposalId: `seed-${ago}`, kind: "purchase", status: "approved", at: reference.getTime() - ago * day, summary: `Approved Sysco produce order ($${(80 + ago * 7).toFixed(2)})`, modified: false }
      : { proposalId: `seed-${ago}`, kind: "substitution", status: i % 5 === 4 ? "rejected" : "approved", at: reference.getTime() - (ago + 1) * day, serviceDate: date, summary: `${i % 5 === 4 ? "Rejected" : "Approved"} ${meal} menu for ${date}`, modified: i % 3 === 1 };
  });
  return { ...s, observations: SEED_OBSERVATIONS(reference), profileUpdates: SEED_PROFILE_UPDATES(reference), history: [...s.history.map((h, i) => ({ ...h, at: reference.getTime() - (i % 3 + 1) * 3600000 })), ...past] };
}

/** Demo reactions and profile changes so the Command Center board starts with real work visible. */
function SEED_OBSERVATIONS(reference: Date): Observation[] {
  const hour = 3600000;
  return [
    { id: "obs-seed-1", residentId: "R005", serviceDate: dateKey(dayAt(0, reference)), meal: "lunch", dishId: "l-lentil", reaction: "Refused most of the tray — soup came back nearly full", severity: "concern", status: "open", notedAt: reference.getTime() - 3 * hour },
    { id: "obs-seed-2", residentId: "R011", serviceDate: dateKey(dayAt(-1, reference)), meal: "dinner", dishId: "d-salmon", reaction: "Coughing during the last few bites; temperature normal afterwards", severity: "concern", status: "open", notedAt: reference.getTime() - 20 * hour },
    { id: "obs-seed-3", residentId: "R002", serviceDate: dateKey(dayAt(-1, reference)), meal: "breakfast", dishId: "b-oatmeal", reaction: "Reported nausea about 30 minutes after the meal", severity: "concern", status: "open", notedAt: reference.getTime() - 22 * hour },
    { id: "obs-seed-4", residentId: "R008", serviceDate: dateKey(dayAt(-2, reference)), meal: "lunch", dishId: "l-club", reaction: "Finished the meal and asked for a second portion", severity: "note", status: "reviewed", notedAt: reference.getTime() - 3 * 86400000 },
  ];
}

function SEED_PROFILE_UPDATES(reference: Date): ProfileUpdate[] {
  const hour = 3600000;
  return [
    { id: "profile-seed-1", residentId: "R003", at: reference.getTime() - 5 * hour, summary: "Care information updated", review: "open" },
    { id: "profile-seed-2", residentId: "R012", at: reference.getTime() - 26 * hour, summary: "Care information updated", review: "open" },
  ];
}

/** Replaces outdated resident records and clears decisions tied to the previous residents. */
export function migrateResidentProfiles(s: KitchenState): KitchenState {
  if (s.residentProfileVersion === RESIDENT_PROFILE_VERSION) return s;
  return { ...s, residentProfileVersion: RESIDENT_PROFILE_VERSION, residents: RESIDENTS.map((r) => ({ ...r, likes: [...r.likes], allergens: [...r.allergens], diets: [...r.diets], ...(r.careProfile ? { careProfile: { ...r.careProfile } } : {}), ...(r.mealInstructions ? { mealInstructions: [...r.mealInstructions] } : {}) })), overrides: { breakfast: {}, lunch: {}, dinner: {} }, scheduledOverrides: {}, alternativePreferences: [], mealApprovals: {}, mealRejections: {} };
}

const KEY = "kitchen-command-v1";
export function migrateAdditionalResidents(s: KitchenState): KitchenState {
  if (s.additionalResidentsVersion === 1) return s;
  return { ...s, additionalResidentsVersion: 1, residents: [...s.residents, ...ADDITIONAL_RESIDENTS.filter((r) => !s.residents.some((existing) => existing.id === r.id))] };
}
export function mergeIngredientCatalog(s: KitchenState): KitchenState {
  return { ...s, ingredients: [...s.ingredients, ...[...INGREDIENTS, ...ADDITIONAL_INGREDIENTS].filter((i) => !s.ingredients.some((x) => x.id === i.id) && !s.deletedIngredientIds?.includes(i.id)).map((i) => ({ ...i }))] };
}
type KitchenContextValue = { state: KitchenState; analysis: Analysis; dispatch: (a: Action) => void };
// Mixed component/function exports can refresh consumers before the mounted provider.
// Preserve the context identity across hot updates so both generations share it.
const Ctx: Context<KitchenContextValue | null> = import.meta.hot?.data?.["kitchenContext"] ?? createContext<KitchenContextValue | null>(null);
if (import.meta.hot?.data) import.meta.hot.data["kitchenContext"] = Ctx;

export function KitchenProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer((s: KitchenState, a: Action) => reducer(s, a), undefined, initialState);
  const loaded = useRef(false);
  const [reference, setReference] = useState<Date | null>(null);
  useEffect(() => {
    setReference(new Date());
    const timer = window.setInterval(() => setReference(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    try { const raw = localStorage.getItem(KEY); const saved = raw ? JSON.parse(raw) as KitchenState : null;
      // Catalog grows over time: merge ingredients the saved state doesn't know yet.
      const withIngredients = saved ? mergeIngredientCatalog(saved) : null;
      const merged = withIngredients ? migrateAdditionalResidents(migrateResidentProfiles(withIngredients)) : null;
      dispatch({ type: "load", state: merged?.seeded ? merged : seedDemo(merged ?? initialState()) }); } catch { /* ignore */ }
    loaded.current = true;
  }, []);
  useEffect(() => { if (loaded.current) localStorage.setItem(KEY, JSON.stringify(state)); }, [state]);
  const analysis = useMemo(() => analyze(state, reference ?? new Date("2026-01-01T12:00:00Z")), [state, reference]);
  if (!reference) return <div className="min-h-screen bg-background" aria-busy="true" />;
  return <Ctx.Provider value={{ state, analysis, dispatch }}>{children}</Ctx.Provider>;
}

export function useKitchen() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useKitchen outside provider");
  return c;
}

export const residentName = (s: KitchenState, id: string) => s.residents.find((r) => r.id === id)?.name ?? id;
export { dishById };
