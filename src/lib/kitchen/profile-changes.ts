import type { Resident } from "./types";

export interface ProfileContentChange { field: string; before: string; after: string; kind?: "photo" }

/** Illustrative comparisons only; never overwrite a resident's care record. */
export function draftProfileChanges(residentId: string): ProfileContentChange[] {
  return residentId === "R012" ? [
    { field: "Favorite foods", before: "Chicken soup and mashed potatoes", after: "Chicken soup, mashed potatoes and steamed carrots" },
    { field: "Meal instructions", before: "Prefers meals served in the dining room.", after: "Prefers meals served in the dining room. Offer smaller portions and a second helping if requested." },
  ] : [
    { field: "Meal instructions", before: "Independent at mealtimes.", after: "Provide assistance with cutting food and check that the resident is comfortably seated before serving." },
    { field: "Clinical notes", before: "Appetite is good; usually finishes meals.", after: "Appetite has decreased this week. Record how much is eaten and offer an afternoon snack." },
  ];
}

/** Store content at edit time, never reconstruct the old profile from the current one. */
export function profileContentChanges(previous: Resident, next: Resident): ProfileContentChange[] {
  const changes: ProfileContentChange[] = [];
  const add = (field: string, before: string, after: string) => {
    if (before !== after) changes.push({ field, before, after });
  };
  add("Name", previous.name, next.name);
  add("Room", previous.room, next.room);
  add("Age", String(previous.age), String(next.age));
  add("Food allergies", previous.allergens.join(", "), next.allergens.join(", "));
  add("Diet type", previous.diets.join(", "), next.diets.join(", "));
  add("Favorite foods", previous.likes.join(", "), next.likes.join(", "));
  add("Clinical notes", previous.notes, next.notes);
  add("Meal instructions", (previous.mealInstructions ?? []).join("\n"), (next.mealInstructions ?? []).join("\n"));
  for (const key of new Set([...Object.keys(previous.careProfile ?? {}), ...Object.keys(next.careProfile ?? {})])) {
    add(`Care profile · ${key}`, previous.careProfile?.[key] ?? "", next.careProfile?.[key] ?? "");
  }
  if (previous.photoUrl !== next.photoUrl) changes.push({ field: "Profile photo", before: previous.photoUrl ?? "", after: next.photoUrl ?? "", kind: "photo" });
  return changes;
}