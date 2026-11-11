import { describe, expect, it } from "vitest";
import { DISHES, initialState } from "@/lib/kitchen/data";
import { mealSignature, resolveMenuState } from "@/lib/kitchen/engine";
import { reducer } from "@/lib/kitchen/store";
import { MEALS, type KitchenState, type Meal } from "@/lib/kitchen/types";
import { weeklyMenu } from "@/lib/kitchen/weekly-menu";
import { daysBetween } from "@/lib/kitchen/weekly-schedule";

// Wednesday Nov 11, 2026. Service week Nov 9, purchasing week Nov 16, planning week Nov 23.
const now = new Date(2026, 10, 11, 9, 30);
const WEEK = "week-2026-11-23";
const PUREED_LUNCH = "LUN-VGN-14"; // safe for every seeded resident, never chosen as a primary main

const withWeeks = (s: KitchenState, ...dates: string[]) => dates.reduce((acc, date) => reducer(acc, { type: "createWeeklyPlan", date }, now), s);
const generate = (s: KitchenState, id = WEEK) => reducer(s, { type: "generateWeeklyMenu", id }, now);
const slotOf = (s: KitchenState, date: string, meal: Meal) => weeklyMenu(s, date, now).slots.find((x) => x.date === date && x.meal === meal)!;
const offset = (date: string) => daysBetween("2026-11-11", date);
const approve = (s: KitchenState, date: string, meal: Meal): KitchenState => {
  const signature = mealSignature(resolveMenuState(s, offset(date), now), meal);
  return { ...s, mealApprovals: { ...s.mealApprovals, [date]: { ...s.mealApprovals?.[date], [meal]: { signature, approvedAt: 1 } } } };
};

describe("weekly menu selector", () => {
  it("returns exactly seven Monday–Sunday days and 21 primary meal slots", () => {
    const menu = weeklyMenu(withWeeks(initialState(), "2026-11-26"), WEEK, now);
    expect(menu.days.map((d) => [d.date, d.weekday])).toEqual([
      ["2026-11-23", "Mon"], ["2026-11-24", "Tue"], ["2026-11-25", "Wed"], ["2026-11-26", "Thu"],
      ["2026-11-27", "Fri"], ["2026-11-28", "Sat"], ["2026-11-29", "Sun"],
    ]);
    expect(menu.slots).toHaveLength(21);
    for (const day of menu.days) expect(day.slots.map((x) => x.meal)).toEqual(MEALS);
  });

  it("accepts any date in the week, with or without a saved WeeklyPlan", () => {
    const s = withWeeks(initialState(), "2026-11-23");
    expect(weeklyMenu(s, "2026-11-28", now).weekId).toBe(WEEK);
    expect(weeklyMenu(s, "2026-11-28", now).plan?.id).toBe(WEEK);
    expect(weeklyMenu(initialState(), "2026-12-02", now)).toMatchObject({ weekId: "week-2026-11-30", plan: undefined });
  });

  it("counts real residents instead of a fixed twelve", () => {
    const s = withWeeks(initialState(), "2026-11-23");
    const menu = weeklyMenu(s, WEEK, now);
    expect(menu.residentsTotal).toBe(s.residents.length);
    expect(menu.residentsTotal).not.toBe(12);
    expect(menu.residentsCovered).toBeLessThanOrEqual(menu.residentsTotal);
    for (const slot of menu.slots) expect(slot.residentsSafe + slot.pendingAlternatives + slot.unresolved).toBe(s.residents.length);
    const fewer = { ...s, residents: s.residents.slice(0, 5) };
    expect(weeklyMenu(fewer, WEEK, now).residentsTotal).toBe(5);
  });

  it("locks past slots of the current service week", () => {
    const menu = weeklyMenu(withWeeks(initialState(), "2026-11-09"), "week-2026-11-09", now);
    expect(menu.days.map((d) => d.slots[0]!.lock)).toEqual(["past", "past", null, null, null, null, null]);
  });
});

describe("weekly menu generation", () => {
  it("saves 21 catalog meals into the existing scheduledPlans and moves the menu to review", () => {
    const s = generate(withWeeks(initialState(), "2026-11-23"));
    const menu = weeklyMenu(s, WEEK, now);
    expect(menu.savedSlots).toBe(21);
    for (const slot of menu.slots) {
      expect(s.scheduledPlans?.[slot.date]?.[slot.meal]).toBe(slot.dishId);
      const dish = DISHES.find((d) => d.id === slot.dishId)!;
      expect(dish.meal).toBe(slot.meal);
      expect(dish.tags).not.toContain("pureed");
      // Every other screen resolving the date sees the same main.
      expect(resolveMenuState(s, offset(slot.date), now).plan[slot.meal]).toBe(slot.dishId);
    }
    expect(new Set(menu.slots.map((x) => x.dishId)).size).toBe(21);
    expect(menu.plan).toMatchObject({ menuStatus: "needs-review", menuApprovedAt: null });
    expect(s.weeklyPlans?.[0]).not.toHaveProperty("days");
  });

  it("preserves previously saved menus, resident alternatives and approved meals", () => {
    let s = withWeeks(initialState(), "2026-11-23");
    const savedLunch = DISHES.find((d) => d.meal === "lunch" && !d.tags.includes("pureed"))!.id;
    s = { ...s,
      scheduledPlans: { "2026-11-24": { lunch: savedLunch } },
      scheduledOverrides: { "2026-11-24": { lunch: { [s.residents[0]!.id]: PUREED_LUNCH } } },
    };
    s = approve(s, "2026-11-24", "lunch");
    const before = slotOf(s, "2026-11-24", "lunch");
    expect(before).toMatchObject({ approved: true, lock: "approved-meal" });
    const generated = generate(s);
    expect(slotOf(generated, "2026-11-24", "lunch")).toEqual(before);
    expect(generated.scheduledOverrides?.["2026-11-24"]?.lunch).toEqual({ [s.residents[0]!.id]: PUREED_LUNCH });
    expect(generated.mealApprovals?.["2026-11-24"]?.lunch).toEqual(s.mealApprovals?.["2026-11-24"]?.lunch);
    expect(weeklyMenu(generated, WEEK, now).savedSlots).toBe(21);
    // Running again is a no-op: nothing left to fill.
    expect(generate(generated)).toBe(generated);
  });

  it("keeps today's resident alternatives when filling the current service week", () => {
    let s = withWeeks(initialState(), "2026-11-09");
    const resident = s.residents[0]!.id;
    s = { ...s, overrides: { ...s.overrides, lunch: { [resident]: PUREED_LUNCH } } };
    s = generate(s, "week-2026-11-09");
    expect(s.scheduledOverrides?.["2026-11-11"]?.lunch?.[resident]).toBe(PUREED_LUNCH);
    expect(slotOf(s, "2026-11-11", "lunch").overrides[resident]).toBe(PUREED_LUNCH);
    // Past days are never written.
    expect(s.scheduledPlans?.["2026-11-09"]).toBeUndefined();
    expect(s.scheduledPlans?.["2026-11-10"]).toBeUndefined();
  });

  it("changing one week never alters another week", () => {
    let s = withWeeks(initialState(), "2026-11-16", "2026-11-23");
    s = generate(s, "week-2026-11-16");
    const other = weeklyMenu(s, "week-2026-11-16", now);
    const otherPlan = s.weeklyPlans?.find((p) => p.id === "week-2026-11-16");
    s = generate(s, WEEK);
    s = reducer(s, { type: "regenerateWeeklyMeal", id: WEEK, date: "2026-11-25", meal: "dinner" }, now);
    expect(weeklyMenu(s, "week-2026-11-16", now).slots).toEqual(other.slots);
    expect(s.weeklyPlans?.find((p) => p.id === "week-2026-11-16")).toEqual(otherPlan);
    expect(Object.keys(s.scheduledPlans ?? {}).filter((d) => d < "2026-11-16" || d > "2026-11-29")).toEqual([]);
  });

  it("refuses to generate over an approved week", () => {
    let s = generate(withWeeks(initialState(), "2026-11-23"));
    s = { ...s, scheduledPlans: {} };
    s = reducer(s, { type: "updateWeeklyPlanStatus", id: WEEK, menuStatus: "approved" }, now);
    expect(generate(s)).toBe(s);
  });
});

describe("regenerating and revising single meals", () => {
  it("replaces one meal and leaves the other 20 untouched", () => {
    const s = generate(withWeeks(initialState(), "2026-11-23"));
    const before = weeklyMenu(s, WEEK, now);
    const next = reducer(s, { type: "regenerateWeeklyMeal", id: WEEK, date: "2026-11-26", meal: "lunch" }, now);
    const after = weeklyMenu(next, WEEK, now);
    const changed = after.slots.filter((x, i) => x.dishId !== before.slots[i]!.dishId);
    expect(changed.map((x) => [x.date, x.meal])).toEqual([["2026-11-26", "lunch"]]);
    expect(new Set(after.slots.map((x) => x.dishId)).size).toBe(21);
  });

  it("keeps safe resident alternatives on a regenerated meal", () => {
    let s = generate(withWeeks(initialState(), "2026-11-23"));
    const resident = s.residents[0]!.id;
    s = { ...s, scheduledOverrides: { ...s.scheduledOverrides, "2026-11-26": { ...s.scheduledOverrides?.["2026-11-26"], lunch: { [resident]: PUREED_LUNCH } } } };
    s = reducer(s, { type: "regenerateWeeklyMeal", id: WEEK, date: "2026-11-26", meal: "lunch" }, now);
    expect(s.scheduledOverrides?.["2026-11-26"]?.lunch).toEqual({ [resident]: PUREED_LUNCH });
  });

  it("requires an explicit revision before changing an approved meal", () => {
    let s = approve(generate(withWeeks(initialState(), "2026-11-23")), "2026-11-26", "lunch");
    const regen = { type: "regenerateWeeklyMeal", id: WEEK, date: "2026-11-26", meal: "lunch" } as const;
    expect(reducer(s, regen, now)).toBe(s);
    s = reducer(s, { type: "reviseWeeklyMenu", id: WEEK, date: "2026-11-26", meal: "lunch" }, now);
    expect(slotOf(s, "2026-11-26", "lunch")).toMatchObject({ approved: false, lock: null });
    expect(reducer(s, regen, now)).not.toBe(s);
  });

  it("reopens an approved week, and its purchasing, only through revision", () => {
    let s = generate(withWeeks(initialState(), "2026-11-23"));
    s = reducer(s, { type: "updateWeeklyPlanStatus", id: WEEK, menuStatus: "approved" }, now);
    s = reducer(s, { type: "updateWeeklyPlanStatus", id: WEEK, purchasingStatus: "approved" }, now);
    const regen = { type: "regenerateWeeklyMeal", id: WEEK, date: "2026-11-27", meal: "dinner" } as const;
    expect(reducer(s, regen, now)).toBe(s);
    expect(slotOf(s, "2026-11-27", "dinner").lock).toBe("approved-week");
    s = reducer(s, { type: "reviseWeeklyMenu", id: WEEK }, now);
    expect(s.weeklyPlans?.[0]).toMatchObject({ menuStatus: "needs-review", menuApprovedAt: null, purchasingStatus: "needs-review", purchasingApprovedAt: null });
    expect(reducer(s, regen, now)).not.toBe(s);
  });

  it("treats a daily-screen edit to an approved week as a revision", () => {
    let s = generate(withWeeks(initialState(), "2026-11-16", "2026-11-23"));
    s = reducer(s, { type: "updateWeeklyPlanStatus", id: WEEK, menuStatus: "approved" }, now);
    const lunch = DISHES.find((d) => d.meal === "lunch" && d.id !== slotOf(s, "2026-11-25", "lunch").dishId && !d.tags.includes("pureed"))!.id;
    const edited = reducer(s, { type: "setMealPlan", date: "2026-11-25", meal: "lunch", dishId: lunch, overrides: {} }, now);
    expect(edited.scheduledPlans?.["2026-11-25"]?.lunch).toBe(lunch);
    expect(edited.weeklyPlans?.find((p) => p.id === WEEK)?.menuStatus).toBe("needs-review");
    // Edits outside an approved week leave week statuses alone.
    const outside = reducer(s, { type: "setMealPlan", date: "2026-11-18", meal: "lunch", dishId: lunch, overrides: {} }, now);
    expect(outside.weeklyPlans).toEqual(s.weeklyPlans);
  });
});
