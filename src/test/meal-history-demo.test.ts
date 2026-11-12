import { describe, expect, it } from "vitest";
import { initialState, dishById } from "@/lib/kitchen/data";
import { conflictReasons } from "@/lib/kitchen/engine";
import { migrateMealHistory } from "@/lib/kitchen/meal-history-demo";
import { residentMealHistory } from "@/lib/kitchen/resident-meal-history";
import { dateKey, dayAt } from "@/lib/kitchen/schedule";

const reference = new Date("2026-11-11T12:00:00");

describe("meal history seed", () => {
  it("gives every resident recorded meals for each of the past 30 days", () => {
    const state = migrateMealHistory(initialState(), reference);
    for (const resident of state.residents) {
      const history = residentMealHistory(state, resident.id, 30, reference);
      // The 30-day window includes today, which has no recorded menu yet: 29 past days × 3 meals.
      expect(history.length).toBe(87);
      expect(history.every((r) => r.source === "recorded-menu")).toBe(true);
    }
  });

  it("only serves dishes that match each resident's food requirements", () => {
    const state = migrateMealHistory(initialState(), reference);
    for (const resident of state.residents) {
      for (const record of residentMealHistory(state, resident.id, 30, reference)) {
        const dish = dishById(record.dishId);
        expect(dish.meal).toBe(record.meal);
        expect(conflictReasons(resident, dish)).toEqual([]);
      }
    }
  });

  it("never overwrites existing staff plans or overrides and runs only once", () => {
    const date = dateKey(dayAt(-3, reference));
    const base = initialState();
    const staff = {
      ...base,
      scheduledPlans: { [date]: { lunch: "l-lentil" } },
      scheduledOverrides: { [date]: { lunch: { R001: "l-puree" } } },
    };
    const state = migrateMealHistory(staff, reference);
    expect(state.scheduledPlans?.[date]?.lunch).toBe("l-lentil");
    expect(state.scheduledOverrides?.[date]?.lunch?.["R001"]).toBe("l-puree");
    expect(migrateMealHistory(state, new Date("2026-11-12T12:00:00"))).toBe(state);
  });

  it("leaves future menus and inventory untouched", () => {
    const base = initialState();
    const state = migrateMealHistory(base, reference);
    expect(state.ingredients).toBe(base.ingredients);
    expect(state.plan).toBe(base.plan);
    const tomorrow = dateKey(dayAt(1, reference));
    expect(state.scheduledPlans?.[tomorrow]).toBeUndefined();
  });
});
