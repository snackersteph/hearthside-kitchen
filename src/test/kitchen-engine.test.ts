import { describe, expect, it } from "vitest";
import { analyze, conflictReasons } from "@/lib/kitchen/engine";
import { initialState, dishById } from "@/lib/kitchen/data";
import { reducer } from "@/lib/kitchen/store";
import { dateKey, dayAt, scheduledState } from "@/lib/kitchen/schedule";

describe("kitchen agents", () => {
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
  it("dietary agent flags dairy residents for the alfredo", () => {
    const s = initialState();
    const flagged = analyze(s).conflicts.filter((c) => c.meal === "lunch" && c.reasons.includes("contains dairy")).map((c) => c.residentId).sort();
    expect(flagged).toEqual(["r1", "r12", "r7"]);
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
    for (const p of analyze(s).proposals.filter((p) => p.kind === "substitution"))
      if (p.kind === "substitution") s = reducer(s, { type: "approveSub", proposalId: p.id, meal: p.meal, dishId: p.dishId, residentIds: p.residentIds, modified: false, summary: "" });
    expect(analyze(s).conflicts.length).toBe(0);
    for (const p of analyze(s).proposals)
      if (p.kind === "purchase") s = reducer(s, { type: "approvePurchase", proposalId: p.id, lines: p.lines, modified: false, summary: "" });
    expect(analyze(s).proposals.length).toBe(0);
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
