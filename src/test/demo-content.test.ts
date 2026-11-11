import { describe, expect, it } from "vitest";
import { initialState, dishById } from "@/lib/kitchen/data";
import { conflictReasons } from "@/lib/kitchen/engine";
import { migrateDemoContent } from "@/lib/kitchen/demo-content";
import { reducer } from "@/lib/kitchen/store";
import { residentMealHistory } from "@/lib/kitchen/resident-meal-history";

const reference = new Date("2026-11-11T12:00:00");

describe("showcase content", () => {
  it("adds profile comparisons and both pending and reviewed observations without changing care or stock", () => {
    const base = initialState();
    const state = migrateDemoContent(base, reference);
    expect(state.profileUpdates?.filter((u) => u.review === "open")).toHaveLength(5);
    expect(state.profileUpdates?.filter((u) => u.review === "seen")).toHaveLength(1);
    expect(state.observations?.filter((o) => o.status === "open")).toHaveLength(6);
    expect(state.observations?.filter((o) => o.status === "reviewed")).toHaveLength(2);
    expect(state.residents).toBe(base.residents);
    expect(state.ingredients).toBe(base.ingredients);
    expect(residentMealHistory(state, "R005", 30, reference)).toEqual([]);
    for (const update of state.profileUpdates ?? []) {
      expect(update.demo).toBe(true);
      expect(update.changes?.some((c) => c.before !== c.after && c.after.length > 0)).toBe(true);
    }
  });

  it("uses existing residents and recipes compatible with each resident's food requirements", () => {
    const state = migrateDemoContent(initialState(), reference);
    for (const observation of state.observations ?? []) {
      const resident = state.residents.find((r) => r.id === observation.residentId);
      if (!resident) throw new Error("Demo observation has no resident");
      const dish = dishById(observation.dishId);
      expect(dish.meal).toBe(observation.meal);
      expect(conflictReasons(resident, dish)).toEqual([]);
      expect(new Date(`${observation.serviceDate}T00:00:00`).getTime()).toBeLessThanOrEqual(reference.getTime());
    }
  });

  it("preserves staff records and does not reopen reviewed examples on reload", () => {
    const base = { ...initialState(), profileUpdates: [{ id: "staff-update", residentId: "R001", at: 1, summary: "Staff edit", review: "seen" as const }] };
    const state = migrateDemoContent(base, reference);
    expect(state.profileUpdates?.[0]).toBe(base.profileUpdates[0]);
    const acknowledged = reducer(state, { type: "acknowledgeProfileUpdate", id: "demo-profile-v1-R003" }, reference);
    const reviewed = reducer(acknowledged, { type: "reviewObservation", id: "demo-observation-v1-R005" }, reference);
    expect(migrateDemoContent(reviewed, new Date("2026-11-12T12:00:00"))).toBe(reviewed);
    expect(reviewed.profileUpdates?.find((u) => u.id === "demo-profile-v1-R003")?.review).toBe("seen");
    expect(reviewed.observations?.find((o) => o.id === "demo-observation-v1-R005")?.status).toBe("reviewed");
  });

  it("does not restore deleted resident profiles or create examples for them", () => {
    const base = initialState();
    const state = migrateDemoContent({ ...base, residents: base.residents.filter((r) => r.id !== "R003") }, reference);
    expect(state.profileUpdates?.some((u) => u.residentId === "R003")).toBe(false);
    expect(state.observations?.some((o) => o.residentId === "R003")).toBe(false);
  });
});