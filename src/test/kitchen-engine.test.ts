import { describe, expect, it } from "vitest";
import { analyze, analyzeMenuDay, compareMealUrgency, conflictReasons, perServingQty } from "@/lib/kitchen/engine";
import { initialState, dishById } from "@/lib/kitchen/data";
import { reducer } from "@/lib/kitchen/store";
import { canApproveMeal, approvalDueDate, dateKey, dayAt, scheduledState } from "@/lib/kitchen/schedule";

describe("kitchen agents", () => {
  it("orders meal reviews by earliest deadline and service meal time", () => {
    const reviews = analyze(initialState(), new Date("2026-11-07T12:00:00")).mealReviews ?? [];
    const sorted = [...reviews].reverse().sort(compareMealUrgency);
    expect(sorted.slice(0, 4).map((r) => [r.serviceDate, r.meal])).toEqual([
      ["2026-11-07", "breakfast"], ["2026-11-07", "lunch"], ["2026-11-07", "dinner"], ["2026-11-08", "breakfast"],
    ]);
  });

  it("keeps rejected meals needing replacement and blocks sign-off until revised", () => {
    const reference = new Date("2026-11-07T12:00:00");
    let s = initialState();
    s.residents = s.residents.map((r) => ({ ...r, allergens: [], diets: [] }));
    const rejected = reducer(s, { type: "rejectMeal", date: "2026-11-08", meal: "breakfast" }, reference);
    expect(analyze(rejected, reference).mealReviews?.find((r) => r.serviceDate === "2026-11-08" && r.meal === "breakfast")?.rejected).toBe(true);
    expect(reducer(rejected, { type: "approveMeal", date: "2026-11-08", meal: "breakfast" }, reference)).toBe(rejected);
    expect(rejected.history[0]?.status).toBe("rejected");
    const changed = reducer(rejected, { type: "setMealPlan", date: "2026-11-08", meal: "breakfast", dishId: "b-oatmeal", overrides: {} }, reference);
    expect(analyze(changed, reference).mealReviews?.find((r) => r.serviceDate === "2026-11-08" && r.meal === "breakfast")?.rejected).toBe(false);
  });

  it("allows editing approved future meals but locks approved meals on service day", () => {
    const reference = new Date("2026-11-07T12:00:00");
    let s = initialState();
    s.residents = s.residents.map((r) => ({ ...r, allergens: [], diets: [] }));
    s = reducer(s, { type: "approveMeal", date: "2026-11-08", meal: "breakfast" }, reference);
    const action = { type: "setMealPlan" as const, date: "2026-11-08", meal: "breakfast" as const, dishId: "b-oatmeal", overrides: {} };
    const edited = reducer(s, action, reference);
    expect(edited.scheduledPlans?.["2026-11-08"]?.breakfast).toBe("b-oatmeal");
    expect(edited.mealApprovals?.["2026-11-08"]?.breakfast).toBeUndefined();
    expect(reducer(s, action, new Date("2026-11-08T09:00:00"))).toBe(s);
  });

  it("blocks unsafe resident alternatives when saving a meal review", () => {
    const s = initialState();
    const reference = new Date("2026-11-07T12:00:00");
    expect(reducer(s, { type: "setMealPlan", date: "2026-11-08", meal: "lunch", dishId: "l-alfredo", overrides: { R005: "l-alfredo" } }, reference)).toBe(s);
  });

  it("requires approval by November 7 for November 8 service and blocks same-day approval", () => {
    expect(approvalDueDate("2026-11-08")).toBe("2026-11-07");
    expect(canApproveMeal("2026-11-08", new Date("2026-11-07T23:59:00"))).toBe(true);
    expect(canApproveMeal("2026-11-08", new Date("2026-11-08T00:00:00"))).toBe(false);
    const s = initialState();
    expect(reducer(s, { type: "approveMeal", date: "2026-11-08", meal: "lunch" }, new Date("2026-11-08T09:00:00"))).toBe(s);
  });

  it("applies advance alternatives only to their date and refuses late alternatives", () => {
    const reference = new Date("2026-11-07T12:00:00");
    const s = initialState();
    const p = analyzeMenuDay(s, 1, reference).proposals.find((p) => p.kind === "substitution");
    if (!p || p.kind !== "substitution") throw new Error("Missing swap");
    const action = { type: "approveSub" as const, proposalId: p.id, serviceDate: "2026-11-08", meal: p.meal, dishId: p.dishId, residentIds: p.residentIds, modified: false, summary: "Advance swap" };
    const next = reducer(s, action, reference);
    expect(next.overrides).toEqual(s.overrides);
    expect(scheduledState(next, 1, reference).overrides[p.meal][p.residentIds[0] ?? ""]).toBe(p.dishId);
    expect(scheduledState(next, 2, reference).overrides).toEqual({ breakfast: {}, lunch: {}, dinner: {} });
    expect(reducer(s, action, new Date("2026-11-08T08:00:00"))).toBe(s);
  });

  it("only signs off a fully resolved meal and invalidates it when edited", () => {
    const reference = new Date("2026-11-07T12:00:00");
    let s = initialState();
    expect(reducer(s, { type: "approveMeal", date: "2026-11-08", meal: "breakfast" }, reference)).toBe(s);
    for (const p of analyzeMenuDay(s, 1, reference).proposals) {
      if (p.kind === "substitution") s = reducer(s, { type: "approveSub", proposalId: p.id, serviceDate: p.serviceDate, meal: p.meal, dishId: p.dishId, residentIds: p.residentIds, modified: false, summary: "Swap" }, reference);
    }
    s = reducer(s, { type: "approveMeal", date: "2026-11-08", meal: "breakfast" }, reference);
    expect(analyze(s, reference).mealReviews?.find((r) => r.serviceDate === "2026-11-08" && r.meal === "breakfast")?.approved).toBe(true);
    const arrived = new Date("2026-11-08T12:00:00");
    expect(analyze(s, arrived).mealReviews?.find((r) => r.serviceDate === "2026-11-08" && r.meal === "breakfast")?.approved).toBe(true);
    const edited = reducer(s, { type: "setScheduledMain", date: "2026-11-08", meal: "breakfast", dishId: "b-oatmeal" }, reference);
    expect(edited.mealApprovals?.["2026-11-08"]?.breakfast).toBeUndefined();
    expect(edited.scheduledOverrides?.["2026-11-08"]?.breakfast).toEqual({});
    const resident = s.residents[0];
    if (!resident) throw new Error("Missing resident");
    const changed = reducer(s, { type: "updateResident", resident: { ...resident, allergens: ["nuts"] } }, reference);
    expect(analyze(changed, reference).mealReviews?.find((r) => r.serviceDate === "2026-11-08" && r.meal === "breakfast")?.approved).toBe(false);
  });

  it("saves upcoming meal edits for their date without changing today or other days", () => {
    const s = initialState();
    const date = dateKey(dayAt(1));
    const edited = reducer(s, { type: "setScheduledMain", date, meal: "lunch", dishId: "l-alfredo" });
    expect(edited.scheduledPlans?.[date]?.lunch).toBe("l-alfredo");
    expect(scheduledState(edited, 1).plan.lunch).toBe("l-alfredo");
    expect(edited.plan).toEqual(s.plan);
    expect(scheduledState(edited, 2).plan).toEqual(scheduledState(s, 2).plan);
  });

  it("does not allow editing past meals", () => {
    const s = initialState();
    expect(reducer(s, { type: "setScheduledMain", date: dateKey(dayAt(-1)), meal: "lunch", dishId: "l-alfredo" })).toBe(s);
  });

  it("includes edited upcoming meals in the purchasing forecast", () => {
    const reference = new Date("2026-11-08T12:00:00");
    const s = initialState();
    const edited = { ...s, scheduledPlans: { "2026-11-09": { lunch: "l-alfredo" } } };
    const expected = analyze(scheduledState(edited, 1, reference), reference).demand;
    expect(analyze(edited, reference).forecast?.days[1]?.demand).toEqual(expected);
    expect(analyze(edited, reference).forecast?.days[1]?.demand).not.toEqual(analyze(s, reference).forecast?.days[1]?.demand);
  });
  it("converts g/ml recipe quantities to kg/L stock units", () => {
    expect(perServingQty("kg", 200, "g")).toBe(0.2);
    expect(perServingQty("L", 15, "ml")).toBe(0.015);
    expect(perServingQty("each", 1)).toBe(1);
    const s = initialState();
    const day = analyzeMenuDay({ ...s, plan: { ...s.plan, lunch: "l-puree" } });
    // The vegetarian resident gets a meat-free alternative instead.
    expect(day.demand["sweet-potato"]).toBeCloseTo((s.residents.length - 1) * 0.2, 2);
    const forecast = analyze(s).forecast;
    expect(forecast?.todayShortage["sweet-potato"]).toBeUndefined();
    expect(forecast?.todayShortage["carrots"]).toBeUndefined();
    expect(forecast?.todayShortage["olive-oil"]).toBeUndefined();
    expect(forecast?.todayShortage["garlic"]).toBeUndefined();
    expect(forecast?.todayShortage["butter"]).toBeUndefined();
    expect(forecast?.todayShortage["banana"]).toBeUndefined();
  });

  it("dietary agent flags dairy residents for the alfredo", () => {
    const s = initialState();
    const flagged = analyze(s).conflicts.filter((c) => c.meal === "lunch" && c.reasons.includes("contains dairy")).map((c) => c.residentId).sort();
    expect(flagged).toEqual(["R005"]);
  });

  it("menu agent only proposes dishes safe for every covered resident", () => {
    const s = initialState();
    for (const p of analyze(s).proposals) {
      if (p.kind !== "substitution") continue;
      for (const id of p.residentIds) {
        const resident = s.residents.find((r) => r.id === id);
        if (!resident) throw new Error(`Missing resident ${id}`);
        expect(conflictReasons(resident, dishById(p.dishId))).toEqual([]);
      }
    }
  });

  it("approving a swap resolves the conflict and approving an order clears the shortage", () => {
    let s = initialState();
    for (const p of analyzeMenuDay(s, 1).proposals)
      if (p.kind === "substitution") s = reducer(s, { type: "approveSub", proposalId: p.id, serviceDate: p.serviceDate, meal: p.meal, dishId: p.dishId, residentIds: p.residentIds, modified: false, summary: "" });
    expect(analyzeMenuDay(s, 1).conflicts.length).toBe(0);
    for (const p of analyze(s).proposals)
      if (p.kind === "purchase") s = reducer(s, { type: "approvePurchase", proposalId: p.id, lines: p.lines, modified: false, summary: "" });
    expect(analyze(s).proposals.filter((p) => p.kind === "purchase").length).toBe(0);
  });

  it("forecasts exactly 7 or 14 days of scheduled consumption including today", () => {
    const s = initialState();
    const seven = analyze(s).forecast;
    const fourteen = analyze({ ...s, purchaseHorizonDays: 14 }).forecast;
    expect(seven?.days.length).toBe(7);
    expect(fourteen?.days.length).toBe(14);
    const expected = Array.from({ length: 7 }, (_, offset) => analyze(scheduledState(s, offset)).demand["chicken"] ?? 0).reduce((sum, qty) => sum + qty, 0);
    expect(seven?.demand["chicken"]).toBeCloseTo(expected, 2);
    expect(fourteen?.demand["chicken"]).toBeGreaterThan(seven?.demand["chicken"] ?? 0);
  });

  it("incoming ingredients cannot cover same-day cooking", () => {
    const s = initialState();
    s.ingredients = s.ingredients.map((i) => i.id === "chicken" ? { ...i, stock: 0, onOrder: 100 } : i);
    expect(analyze(s).forecast?.todayShortage["chicken"]).toBe(analyze(s).demand["chicken"]);
  });

  it("approving a purchase adds incoming quantities without changing stock", () => {
    const s = initialState();
    const approved = reducer(s, { type: "approvePurchase", proposalId: "test", vendor: "Sysco", deliveryDate: "2026-11-10", lines: [{ ingredientId: "chicken", qty: 8, shortage: 8 }], modified: false, summary: "Order" });
    expect(approved.ingredients.find((i) => i.id === "chicken")?.stock).toBe(6);
    expect(approved.ingredients.find((i) => i.id === "chicken")?.onOrder).toBe(8);
    expect(approved.orders?.[0]?.deliveryDate).toBe("2026-11-10");
  });

  it("receiving a delivery transfers incoming quantities to stock only once", () => {
    let s = reducer(initialState(), { type: "approvePurchase", proposalId: "test", lines: [{ ingredientId: "chicken", qty: 8, shortage: 8 }], modified: false, summary: "Order" });
    const id = s.orders?.[0]?.id;
    if (!id) throw new Error("No order created");
    s = reducer(s, { type: "receiveOrder", id });
    s = reducer(s, { type: "receiveOrder", id });
    expect(s.ingredients.find((i) => i.id === "chicken")?.stock).toBe(14);
    expect(s.ingredients.find((i) => i.id === "chicken")?.onOrder).toBe(0);
  });

  it("late deliveries do not cover consumption inside the forecast window", () => {
    const reference = new Date("2026-11-08T12:00:00");
    const s = initialState();
    s.ingredients = s.ingredients.map((i) => i.id === "chicken" ? { ...i, onOrder: 100 } : i);
    s.orders = [{ id: "late", vendor: "Sysco", deliveryDate: dateKey(dayAt(10, reference)), status: "incoming", lines: [{ ingredientId: "chicken", qty: 100, shortage: 100 }] }];
    expect(analyze(s, reference).proposals.some((p) => p.kind === "purchase" && p.lines.some((l) => l.ingredientId === "chicken"))).toBe(true);
  });

  it("purchase requests have at least one day of lead time", () => {
    const reference = new Date("2026-11-08T12:00:00");
    const s = { ...initialState(), leadTimeDays: 0 };
    const order = analyze(s, reference).proposals.find((p) => p.kind === "purchase");
    expect(order?.kind === "purchase" ? order.deliveryDate : undefined).toBe("2026-11-09");
  });
});

import { seedDemo } from "@/lib/kitchen/store";
describe("demo seed", () => {
  it("starts with approved upcoming meals and past-month history", () => {
    const reference = new Date("2026-11-07T12:00:00");
    const s = seedDemo(initialState(), reference);
    expect((analyze(s, reference).mealReviews ?? []).filter((r) => r.approved).length).toBeGreaterThan(0);
    expect(s.history.some((h) => h.at < reference.getTime() - 14 * 86400000)).toBe(true);
  });
});
