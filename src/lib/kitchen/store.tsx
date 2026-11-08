import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { initialState, dishById } from "./data";
import { analyze, type Analysis } from "./engine";
import type { KitchenState, Meal, PurchaseLine, Resident } from "./types";

type Action =
  | { type: "load"; state: KitchenState }
  | { type: "reset" }
  | { type: "setMain"; meal: Meal; dishId: string }
  | { type: "updateResident"; resident: Resident }
  | { type: "setStock"; id: string; stock: number }
  | { type: "approveSub"; proposalId: string; meal: Meal; dishId: string; residentIds: string[]; modified: boolean; summary: string }
  | { type: "approvePurchase"; proposalId: string; lines: PurchaseLine[]; modified: boolean; summary: string }
  | { type: "reject"; proposalId: string; kind: "substitution" | "purchase"; summary: string; note?: string };

export function reducer(s: KitchenState, a: Action): KitchenState {
  switch (a.type) {
    case "load": return a.state;
    case "reset": return initialState();
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
        ingredients: s.ingredients.map((i) => { const l = a.lines.find((x) => x.ingredientId === i.id); return l ? { ...i, onOrder: i.onOrder + l.qty } : i; }),
        history: [{ proposalId: a.proposalId, kind: "purchase", status: "approved", at: Date.now(), summary: a.summary, modified: a.modified }, ...s.history],
      };
    case "reject":
      return { ...s, history: [{ proposalId: a.proposalId, kind: a.kind, status: "rejected", at: Date.now(), summary: a.summary, modified: false, ...(a.note ? { note: a.note } : {}) }, ...s.history] };
  }
}

const KEY = "kitchen-command-v1";
const Ctx = createContext<{ state: KitchenState; analysis: Analysis; dispatch: (a: Action) => void } | null>(null);

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
