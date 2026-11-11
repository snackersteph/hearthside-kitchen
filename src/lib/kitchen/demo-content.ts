import { DISHES } from "./data";
import { conflictReasons } from "./engine";
import { dateKey, dayAt } from "./schedule";
import type { KitchenState, Meal, Observation, ProfileUpdate } from "./types";

/** Fictional showcase records only: never change the actual resident care profiles. */
export function migrateDemoContent(state: KitchenState, reference = new Date()): KitchenState {
  if (state.demoContentVersion === 1) return state;
  const hour = 3600000;
  const profileSpecs = [
    { residentId: "R003", field: "Meal instructions", before: "Meal setup assistance provided on request.", summary: "Mealtime support clarified", ago: 1, review: "open" as const },
    { residentId: "R012", field: "Favorite foods", before: "Food preferences had not yet been recorded.", summary: "Favorite foods added to meal planning", ago: 3, review: "open" as const },
    { residentId: "R005", field: "Clinical notes", before: "Appetite and mealtime support awaiting review.", summary: "Appetite and dining notes updated", ago: 5, review: "open" as const },
    { residentId: "R011", field: "Meal instructions", before: "See care plan for mealtime instructions.", summary: "Serving instructions made more specific", ago: 7, review: "open" as const },
    { residentId: "R002", field: "Favorite foods", before: "Offer the standard menu within the resident's dietary requirements.", summary: "Resident food preferences recorded", ago: 21, review: "open" as const },
    { residentId: "R008", field: "Clinical notes", before: "Dining preferences pending the weekly review.", summary: "Weekly dining review completed", ago: 26, review: "seen" as const },
  ];
  const profiles: ProfileUpdate[] = profileSpecs.flatMap((spec) => {
    const resident = state.residents.find((r) => r.id === spec.residentId);
    if (!resident) return [];
    const after = spec.field === "Favorite foods" ? resident.likes.join(", ")
      : spec.field === "Meal instructions" ? (resident.mealInstructions ?? []).join("\n") || resident.notes
      : resident.notes;
    if (!after.trim() || after === spec.before) return [];
    return [{ id: `demo-profile-v1-${resident.id}`, residentId: resident.id, residentName: resident.name,
      at: reference.getTime() - spec.ago * hour, summary: spec.summary, review: spec.review, demo: true,
      changes: [{ field: spec.field, before: spec.before, after }],
      ...(spec.review === "seen" ? { acknowledgedAt: reference.getTime() - 24 * hour } : {}),
    }];
  });
  const observationSpecs: { residentId: string; meal: Meal; ago: number; severity: Observation["severity"]; status: Observation["status"]; reaction: string }[] = [
    { residentId: "R005", meal: "breakfast", ago: 1, severity: "concern", status: "open", reaction: "Ate around one quarter of breakfast and said they were not hungry. Dining staff noted the reduced intake for follow-up." },
    { residentId: "R011", meal: "dinner", ago: 18, severity: "concern", status: "open", reaction: "Paused several times while eating and reported that the meal felt difficult to swallow. Staff stopped the meal and notified the care team." },
    { residentId: "R002", meal: "dinner", ago: 19, severity: "concern", status: "open", reaction: "Reported mild nausea after dinner and left half the portion. The care team was informed; meal intake needs follow-up." },
    { residentId: "R003", meal: "breakfast", ago: 2, severity: "note", status: "open", reaction: "Finished breakfast with setup assistance and said the smaller portion was easier to manage. Asked for the same portion size tomorrow." },
    { residentId: "R012", meal: "lunch", ago: 22, severity: "note", status: "open", reaction: "Enjoyed lunch but said it cooled down before they finished. Requested that the next tray arrive closer to their usual dining time." },
    { residentId: "R001", meal: "lunch", ago: 23, severity: "note", status: "open", reaction: "Ate most of lunch and asked for more variety in the vegetables. Preference shared with the kitchen for the next menu review." },
    { residentId: "R008", meal: "dinner", ago: 42, severity: "note", status: "reviewed", reaction: "Finished the meal and complimented the presentation. Dining preference recorded and shared with the kitchen." },
    { residentId: "R004", meal: "breakfast", ago: 45, severity: "concern", status: "reviewed", reaction: "Initially declined breakfast but accepted a smaller serving later. Care team reviewed the intake record; no further kitchen action requested." },
  ];
  const observations: Observation[] = observationSpecs.flatMap((spec) => {
    const resident = state.residents.find((r) => r.id === spec.residentId);
    if (!resident) return [];
    const dish = DISHES.find((d) => d.meal === spec.meal && conflictReasons(resident, d).length === 0);
    if (!dish) return [];
    const notedAt = reference.getTime() - spec.ago * hour;
    return [{ ...spec, id: `demo-observation-v1-${resident.id}`, dishId: dish.id, demo: true,
      serviceDate: dateKey(dayAt(0, new Date(notedAt))), notedAt }];
  });
  return { ...state, demoContentVersion: 1,
    profileUpdates: [...(state.profileUpdates ?? []), ...profiles.filter((p) => !state.profileUpdates?.some((u) => u.id === p.id))],
    observations: [...(state.observations ?? []), ...observations.filter((o) => !state.observations?.some((existing) => existing.id === o.id))],
  };
}