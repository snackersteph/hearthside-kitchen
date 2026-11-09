import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type Context, type ReactNode } from "react";
import { initialState, dishById, INGREDIENTS } from "./data";
import { analyze, analyzeMenuDay, conflictReasons, dietarySignature, mealSignature, resolveMenuState, type Analysis } from "./engine";
import type { Ingredient, KitchenState, Meal, PurchaseLine, Resident } from "./types";
import { canApproveMeal, dateKey, dayAt, scheduledState } from "./schedule";

type Action =
  | { type: "addResident"; resident: Resident }
  | { type: "addIngredient"; ingredient: Ingredient }
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
  | { type: "setStock"; id: string; stock: number }
  | { type: "approveSub"; proposalId: string; meal: Meal; dishId: string; residentIds: string[]; serviceDate?: string | undefined; modified: boolean; summary: string; remember?: boolean }
  | { type: "approvePurchase"; proposalId: string; lines: PurchaseLine[]; modified: boolean; summary: string; vendor?: string; deliveryDate?: string }
  | { type: "reject"; proposalId: string; kind: "substitution" | "purchase"; summary: string; serviceDate?: string | undefined; note?: string };

export function reducer(s: KitchenState, a: Action, reference = new Date()): KitchenState {
  switch (a.type) {
    case "addResident": {
      if (!a.resident.name.trim() || !a.resident.room.trim() || !Number.isInteger(a.resident.age) || a.resident.age < 1 || a.resident.age > 120 || s.residents.some((r) => r.id === a.resident.id)) return s;
      return { ...s, residents: [...s.residents, { ...a.resident, name: a.resident.name.trim(), room: a.resident.room.trim() }] };
    }
    case "addIngredient": {
      const i = a.ingredient;
      if (!i.name.trim() || !i.vendor.trim() || !["kg", "L", "each"].includes(i.unit) || !Number.isFinite(i.stock) || i.stock < 0 || !Number.isFinite(i.packSize) || i.packSize <= 0 || !Number.isFinite(i.unitCost) || i.unitCost < 0 || i.onOrder !== 0 || s.ingredients.some((x) => x.id === i.id || x.name.trim().toLowerCase() === i.name.trim().toLowerCase())) return s;
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
      if (!changed) return { ...s, residents: s.residents.map((r) => r.id === resident.id ? resident : r) };
      const clear = (meals: Partial<Record<Meal, Record<string, string>>>) => Object.fromEntries(Object.entries(meals).map(([meal, entries]) => [meal, Object.fromEntries(Object.entries(entries ?? {}).filter(([id]) => id !== resident.id))]));
      const today = dateKey(reference);
      return { ...s, residents: s.residents.map((r) => r.id === resident.id ? resident : r),
        alternativePreferences: (s.alternativePreferences ?? []).filter((p) => p.residentId !== resident.id),
        overrides: clear(s.overrides) as KitchenState["overrides"],
        scheduledOverrides: Object.fromEntries(Object.entries(s.scheduledOverrides ?? {}).map(([date, meals]) => [date, date >= today ? clear(meals) : meals])),
      };
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
  return { ...s, history: [...s.history.map((h, i) => ({ ...h, at: reference.getTime() - (i % 3 + 1) * 3600000 })), ...past] };
}

const KEY = "kitchen-command-v1";
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
      const merged = saved ? { ...saved, ingredients: [...saved.ingredients, ...INGREDIENTS.filter((i) => !saved.ingredients.some((x) => x.id === i.id)).map((i) => ({ ...i }))] } : null;
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
