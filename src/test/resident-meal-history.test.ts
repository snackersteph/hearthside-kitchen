import { describe, expect, it } from "vitest";
import { initialState } from "@/lib/kitchen/data";
import { residentMealHistory } from "@/lib/kitchen/resident-meal-history";
import type { KitchenState } from "@/lib/kitchen/types";

const reference = new Date("2026-11-09T12:00:00");
describe("resident recorded meal history", () => {
  it("uses that resident's dated alternative and not another resident's choice", () => {
    const s: KitchenState = { ...initialState(), scheduledPlans: { "2026-11-08": { lunch: "l-club" } }, scheduledOverrides: { "2026-11-08": { lunch: { R001: "l-lentil" } } } };
    expect(residentMealHistory(s, "R001", 7, reference)[0]?.dishId).toBe("l-lentil");
    expect(residentMealHistory(s, "R002", 7, reference)[0]?.dishId).toBe("l-club");
  });
  it("does not invent history from the sample rotation", () => {
    expect(residentMealHistory(initialState(), "R001", 30, reference)).toEqual([]);
  });
  it("retains only the resident's reactions and filters past periods and future meals", () => {
    const s: KitchenState = { ...initialState(), scheduledPlans: { "2026-11-10": { lunch: "l-club" }, "2026-10-30": { lunch: "l-club" } }, observations: [{ id: "o", residentId: "R001", serviceDate: "2026-11-08", meal: "lunch", dishId: "l-lentil", reaction: "Refused tray", status: "reviewed", severity: "concern", notedAt: reference.getTime() }] };
    expect(residentMealHistory(s, "R001", 7, reference)).toEqual([{ date: "2026-11-08", meal: "lunch", dishId: "l-lentil", source: "reported", reactions: ["Refused tray"] }]);
    expect(residentMealHistory(s, "R001", 14, reference)).toHaveLength(2);
    expect(residentMealHistory(s, "R002", 7, reference)).toEqual([]);
  });
});