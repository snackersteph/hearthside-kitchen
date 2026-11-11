import type { Analysis } from "./engine";
import type { KitchenState, Observation } from "./types";
import { dateKey } from "./schedule";
import { recipeLibrary } from "./recipes";
import { MEALS } from "./types";

/** Counts the screens themselves show, so Kitchen Pulse matches the sidebar, Approval Center and Inventory tabs. */
export interface ActionCardCounts { approvals?: number; stockAlerts?: number }

export type ActionCardId = "approvals" | "shortfalls" | "delivered" | "incoming" | "profiles";

export interface ActionCard {
  id: ActionCardId;
  label: string;
  value: number;
  to: "/approvals" | "/inventory" | "/residents" | "/profile-updates";
  actionLabel: string;
  clearLabel: string;
  inventoryView?: "incoming" | "delivered" | "alerts";
}

/** The four Command Center cards. Each counts something staff can still act on; 0 means peaceful. */
export function actionCards(state: KitchenState, analysis: Analysis, reference = new Date(), counts: ActionCardCounts = {}): ActionCard[] {
  const pendingMeals = (analysis.mealReviews ?? []).filter((r) => !r.approved).length;
  const purchases = analysis.proposals.filter((p) => p.kind === "purchase");
  const incoming = (state.orders ?? []).filter((o) => o.status === "incoming");
  return [
    { id: "approvals", label: "Awaiting approval", value: counts.approvals ?? analysis.proposals.length + pendingMeals, to: "/approvals", actionLabel: "Review meals & orders", clearLabel: "Every meal signed off" },
    { id: "shortfalls", label: "Ingredient shortfalls", value: counts.stockAlerts ?? purchases.reduce((n, p) => n + p.lines.length, 0), to: "/inventory", inventoryView: "alerts", actionLabel: "Review orders", clearLabel: "Stock covers the forecast" },
    { id: "delivered", label: "Delivered orders", value: incoming.filter((o) => o.deliveryDate <= dateKey(reference)).length, to: "/inventory", inventoryView: "delivered", actionLabel: "Confirm deliveries", clearLabel: "All deliveries confirmed" },
    { id: "incoming", label: "Incoming orders", value: incoming.length, to: "/inventory", inventoryView: "incoming", actionLabel: "Check deliveries", clearLabel: "Nothing on the way" },
    { id: "profiles", label: "Resident profile updates", value: (state.profileUpdates ?? []).filter((u) => u.review === "open").length, to: "/profile-updates", actionLabel: "Review changes", clearLabel: "All profiles reviewed" },
  ];
}

/** Planned usage is not measured consumption; keep incompatible stock units separate. */
export function dailySnapshot(state: KitchenState, analysis: Analysis) {
  const quantities: Record<string, number> = {};
  let cost = 0;
  const unpriced = Object.keys(analysis.demand).filter((id) => !state.ingredients.some((i) => i.id === id)).length;
  for (const i of state.ingredients) {
    const qty = analysis.demand[i.id] ?? 0;
    quantities[i.unit] = (quantities[i.unit] ?? 0) + qty;
    cost += qty * i.unitCost;
  }
  const meals = MEALS.reduce((n, meal) => n + Object.keys(analysis.served[meal]).length, 0);
  return { residents: state.residents.length, recipes: recipeLibrary(state).length, meals, quantities, cost, costPerResident: state.residents.length ? cost / state.residents.length : 0, unpriced };
}

const SEVERITY_ORDER: Record<Observation["severity"], number> = { concern: 0, note: 1 };

/** Reactions that need follow-up first, then most recently noted. */
export function sortObservations(list: Observation[]): Observation[] {
  return [...list].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.notedAt - a.notedAt);
}

export const openObservations = (state: KitchenState) => sortObservations((state.observations ?? []).filter((o) => o.status === "open"));
export const reviewedObservations = (state: KitchenState) => sortObservations((state.observations ?? []).filter((o) => o.status === "reviewed"));
