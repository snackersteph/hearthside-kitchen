import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type Context, type ReactNode } from "react";
import { initialState, dishById } from "./data";
import { analyze, type Analysis } from "./engine";
import type { KitchenState, Meal, PurchaseLine, Resident } from "./types";
import { dateKey, dayAt } from "./schedule";

type Action =
  | { type: "setHorizon"; days: 7 | 14 }
  | { type: "setLeadTime"; days: number }
  | { type: "receiveOrder"; id: string }
  | { type: "load"; state: KitchenState }
  | { type: "reset" }
  | { type: "setMain"; meal: Meal; dishId: string }
  | { type: "setScheduledMain"; date: string; meal: Meal; dishId: string }
  | { type: "updateResident"; resident: Resident }
  | { type: "setStock"; id: string; stock: number }
  | { type: "approveSub"; proposalId: string; meal: Meal; dishId: string; residentIds: string[]; modified: boolean; summary: string }
  | { type: "approvePurchase"; proposalId: string; lines: PurchaseLine[]; modified: boolean; summary: string; vendor?: string; deliveryDate?: string }
  | { type: "reject"; proposalId: string; kind: "substitution" | "purchase"; summary: string; note?: string };

export function reducer(s: KitchenState, a: Action): KitchenState {
  switch (a.type) {
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
    case "reset": return initialState();
    case "setScheduledMain": {
      if (a.date <= dateKey(dayAt(0)) || dishById(a.dishId).meal !== a.meal) return s;
      return { ...s, scheduledPlans: { ...s.scheduledPlans, [a.date]: { ...s.scheduledPlans?.[a.date], [a.meal]: a.dishId } } };
    }
    case "setMain": return { ...s, plan: { ...s.plan, [a.meal]: a.dishId }, overrides: { ...s.overrides, [a.meal]: {} } };
    case "updateResident": return { ...s, residents: s.residents.map((r) => (r.id === a.resident.id ? a.resident : r)) };
    case "setStock": return { ...s, ingredients: s.ingredients.map((i) => (i.id === a.id ? { ...i, stock: Math.max(0, a.stock) } : i)) };
    case "approveSub": {
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
      return { ...s, history: [{ proposalId: a.proposalId, kind: a.kind, status: "rejected", at: Date.now(), summary: a.summary, modified: false, ...(a.note ? { note: a.note } : {}) }, ...s.history] };
  }
}

const KEY = "kitchen-command-v1";
type KitchenContextValue = { state: KitchenState; analysis: Analysis; dispatch: (a: Action) => void };
// Mixed component/function exports can refresh consumers before the mounted provider.
// Preserve the context identity across hot updates so both generations share it.
const Ctx: Context<KitchenContextValue | null> = import.meta.hot?.data?.["kitchenContext"] ?? createContext<KitchenContextValue | null>(null);
if (import.meta.hot?.data) import.meta.hot.data["kitchenContext"] = Ctx;

export function KitchenProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const loaded = useRef(false);
  useEffect(() => {
    try { const raw = localStorage.getItem(KEY); if (raw) dispatch({ type: "load", state: JSON.parse(raw) }); } catch { /* ignore */ }
    loaded.current = true;
  }, []);
  useEffect(() => { if (loaded.current) localStorage.setItem(KEY, JSON.stringify(state)); }, [state]);
  const analysis = useMemo(() => analyze(state), [state]);
  return <Ctx.Provider value={{ state, analysis, dispatch }}>{children}</Ctx.Provider>;
}

export function useKitchen() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useKitchen outside provider");
  return c;
}

export const residentName = (s: KitchenState, id: string) => s.residents.find((r) => r.id === id)?.name ?? id;
export { dishById };
