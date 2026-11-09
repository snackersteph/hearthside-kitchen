import type { Analysis } from "./engine";
import type { KitchenState, Observation } from "./types";

export type ActionCardId = "approvals" | "shortfalls" | "incoming" | "profiles";

export interface ActionCard {
  id: ActionCardId;
  label: string;
  value: number;
  to: "/approvals" | "/inventory" | "/residents";
  actionLabel: string;
  clearLabel: string;
}

/** The four Command Center cards. Each counts something staff can still act on; 0 means peaceful. */
export function actionCards(state: KitchenState, analysis: Analysis): ActionCard[] {
  const pendingMeals = (analysis.mealReviews ?? []).filter((r) => !r.approved).length;
  const purchases = analysis.proposals.filter((p) => p.kind === "purchase");
  const incoming = (state.orders ?? []).filter((o) => o.status === "incoming");
  return [
    { id: "approvals", label: "Awaiting approval", value: analysis.proposals.length + pendingMeals, to: "/approvals", actionLabel: "Review meals & orders", clearLabel: "Every meal signed off" },
    { id: "shortfalls", label: "Ingredient shortfalls", value: purchases.reduce((n, p) => n + p.lines.length, 0), to: "/inventory", actionLabel: "Review orders", clearLabel: "Stock covers the forecast" },
    { id: "incoming", label: "Incoming ingredient orders", value: incoming.reduce((n, o) => n + o.lines.length, 0), to: "/inventory", actionLabel: "Check deliveries", clearLabel: "Nothing on the way" },
    { id: "profiles", label: "Resident profile updates", value: (state.profileUpdates ?? []).filter((u) => u.review === "open").length, to: "/residents", actionLabel: "Review changes", clearLabel: "All profiles reviewed" },
  ];
}

const SEVERITY_ORDER: Record<Observation["severity"], number> = { concern: 0, note: 1 };

/** Reactions that need follow-up first, then most recently noted. */
export function sortObservations(list: Observation[]): Observation[] {
  return [...list].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.notedAt - a.notedAt);
}

export const openObservations = (state: KitchenState) => sortObservations((state.observations ?? []).filter((o) => o.status === "open"));
export const reviewedObservations = (state: KitchenState) => sortObservations((state.observations ?? []).filter((o) => o.status === "reviewed"));
