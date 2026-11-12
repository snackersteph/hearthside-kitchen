import type { KitchenState } from "./types";
import { dateKey } from "./schedule";
import { weekStartFor, addDays } from "./weekly-schedule";

/** A fictional showcase request, never a modification of resident care or servings. */
export const EMERGENCY_MENU_DEMO = {
  id: "emergency-fluid-menu-nov-2026",
  week: "2026-11-09",
  resident: "Demo resident · Room D01",
  incident: "Following an accident, the resident temporarily requires fluid-only food.",
  previous: "Regular-texture breakfast, lunch and dinner",
  proposed: "Clinician-prescribed fluid-only meals at the prescribed consistency for the remainder of this service week.",
};

export function emergencyMenuDemo(state: KitchenState, reference: Date) {
  if (weekStartFor(dateKey(reference)) !== EMERGENCY_MENU_DEMO.week) return null;
  return { ...EMERGENCY_MENU_DEMO, approvedAt: state.emergencyDemoApprovals?.[EMERGENCY_MENU_DEMO.id] };
}

export function approveEmergencyMenuDemo(state: KitchenState, id: string, reference: Date): KitchenState {
  const request = emergencyMenuDemo(state, reference);
  if (!request || request.id !== id || request.approvedAt) return state;
  if (dateKey(reference) > addDays(request.week, 6)) return state;
  return { ...state, emergencyDemoApprovals: { ...state.emergencyDemoApprovals, [id]: reference.getTime() } };
}