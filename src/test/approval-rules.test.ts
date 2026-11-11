import { describe, expect, it } from "vitest";
import { alternativeOverview, calendarWeekApproval, needsDietaryReview, residentApprovalCount } from "@/components/kitchen/approval-rules";
import { analyze, mealSignature } from "@/lib/kitchen/engine";
import { initialState } from "@/lib/kitchen/data";
import { reducer } from "@/lib/kitchen/store";
import { addDays, createWeeklyPlan } from "@/lib/kitchen/weekly-schedule";

describe("calendar weekly approval summary", () => {
  const reference = new Date(2026, 10, 11, 15, 16);
  const dates = Array.from({ length: 7 }, (_, i) => addDays("2026-11-09", i));
  it("shows Nov 9–15 as approved when all upcoming alternatives are approved despite a weekly draft", () => {
    let state = { ...initialState(), weeklyPlans: [{ ...createWeeklyPlan("2026-11-09", reference), menuStatus: "needs-review" as const }] };
    const before = alternativeOverview(state, reference, dates);
    expect(calendarWeekApproval(before, "2026-11-09", "2026-11-15", reference).pending).toBeGreaterThan(0);
    for (const day of before) for (const p of day.pending) state = reducer(state, { type: "approveSub", proposalId: p.id, meal: p.meal, dishId: p.dishId, residentIds: p.residentIds, serviceDate: p.serviceDate, modified: false, summary: "Approve resident alternatives" }, reference) as typeof state;
    const after = alternativeOverview(state, reference, dates);
    expect(calendarWeekApproval(after, "2026-11-09", "2026-11-15", reference)).toEqual({ status: "approved", pending: 0 });
    expect(state.weeklyPlans[0]?.menuStatus).toBe("needs-review");
  });
  it("counts only pending residents within Nov 9–15 even if the weekly menu is signed off", () => {
    const state = { ...initialState(), weeklyPlans: [{ ...createWeeklyPlan("2026-11-09", reference), menuStatus: "approved" as const }] };
    const overview = alternativeOverview(state, reference);
    const count = residentApprovalCount(overview.filter((day) => day.date <= "2026-11-15").flatMap((day) => day.pending));
    expect(count).toBeGreaterThan(0);
    expect(calendarWeekApproval(overview, "2026-11-09", "2026-11-15", reference)).toEqual({ status: "pending", pending: count });
  });
});

describe("matching calendar and Approval Center alternatives", () => {
  const reference = new Date("2026-11-10T12:00:00");
  it("counts residents instead of cards and decreases by one after an individual approval", () => {
    const state = initialState();
    const day = alternativeOverview(state, reference, ["2026-11-11"])[0];
    const p = day?.pending.find((p) => p.residentIds.length > 1);
    if (!day || !p) throw new Error("Missing grouped alternative");
    const group = { ...p, residentIds: ["resident-1", "resident-2", "resident-3"] };
    expect(residentApprovalCount([group])).toBe(3);
    expect(residentApprovalCount([group, group])).toBe(3);
    const before = residentApprovalCount(day.pending);
    expect(before).toBeGreaterThan(day.pending.length);
    const next = reducer(state, { type: "approveSub", proposalId: p.id, meal: p.meal, dishId: p.dishId, residentIds: p.residentIds.slice(0, 1), serviceDate: p.serviceDate, modified: false, summary: "Individual approval" }, reference);
    expect(residentApprovalCount(alternativeOverview(next, reference, ["2026-11-11"])[0]?.pending ?? [])).toBe(before - 1);
  });
  it("counts alternative cards rather than three main-meal sign-offs", () => {
    const state = initialState();
    const day = alternativeOverview(state, reference, ["2026-11-13"])[0];
    if (!day) throw new Error("Missing day");
    expect(day.pending.map((p) => p.id)).toEqual(analyze(state, reference).proposals.filter((p) => p.kind === "substitution" && p.serviceDate === "2026-11-13").map((p) => p.id));
    let next = state;
    for (const p of day.pending) next = reducer(next, { type: "approveSub", proposalId: p.id, meal: p.meal, dishId: p.dishId, residentIds: p.residentIds, serviceDate: p.serviceDate, modified: false, summary: "Approve all" }, reference);
    const updated = alternativeOverview(next, reference, ["2026-11-13"])[0];
    expect(updated?.pending.length).toBe(0);
    expect(updated?.approved.length).toBe(day.pending.length);
  });
  it("covers dates beyond the old eight-day window without false approved labels", () => {
    const state = initialState();
    const day = alternativeOverview(state, reference).find((d) => d.date === "2026-12-10");
    expect(day?.pending.length).toBeGreaterThan(0);
    expect(day?.approved.length).toBe(0);
  });
  it("keeps today's alternatives out of the future approval queue", () => {
    expect(alternativeOverview(initialState(), reference, ["2026-11-10"])[0]?.pending).toEqual([]);
  });
});

describe("dietary-focused approval visibility", () => {
  const reference = new Date("2026-11-09T12:00:00");
  function breakfast() {
    const review = analyze(initialState(), reference).mealReviews?.find((r) => r.meal === "breakfast");
    if (!review) throw new Error("Missing breakfast review");
    return review;
  }

  it("hides menus without any allergy, intolerance, diet or texture conflict", () => {
    const state = initialState();
    state.residents = state.residents.map((r) => ({ ...r, allergens: [], diets: [] }));
    expect(needsDietaryReview(state, breakfast())).toBe(false);
  });

  it("includes allergy and intolerance accommodations", () => {
    const state = initialState();
    state.residents = [{ id: "allergy", name: "Resident", room: "101", age: 80, allergens: ["dairy"], diets: [], likes: [], notes: "Lactose intolerant" }];
    expect(needsDietaryReview(state, breakfast())).toBe(true);
  });

  it("includes diet and texture accommodations", () => {
    const state = initialState();
    state.residents = [{ id: "texture", name: "Resident", room: "101", age: 80, allergens: [], diets: ["pureed"], likes: [], notes: "" }];
    expect(needsDietaryReview(state, breakfast())).toBe(true);
  });

  it("hides compatible menus even when residents have requirements", () => {
    const state = initialState();
    state.residents = [{ id: "diet", name: "Resident", room: "101", age: 80, allergens: ["dairy"], diets: ["vegetarian", "soft"], likes: [], notes: "" }];
    expect(needsDietaryReview(state, { ...breakfast(), mainDishId: "b-oatmeal" })).toBe(false);
  });

  it("keeps approved accommodations visible after substitutions resolve conflicts", () => {
    const state = initialState();
    state.overrides.breakfast = Object.fromEntries(state.residents.map((r) => [r.id, "b-smoothie"]));
    const review = { ...breakfast(), approved: true, pending: 0, unresolved: 0, signature: mealSignature(state, "breakfast") };
    expect(needsDietaryReview(state, review)).toBe(true);
  });
});