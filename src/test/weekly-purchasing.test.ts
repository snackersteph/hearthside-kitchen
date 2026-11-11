import { describe, expect, it } from "vitest";
import { initialState } from "@/lib/kitchen/data";
import { analyzeMenuDay } from "@/lib/kitchen/engine";
import { reducer } from "@/lib/kitchen/store";
import type { KitchenState, PurchaseProposal } from "@/lib/kitchen/types";
import { shelfLife } from "@/lib/kitchen/ingredient-freshness";
import { addDays, createWeeklyPlan, daysBetween } from "@/lib/kitchen/weekly-schedule";
import { weekStatus } from "@/lib/kitchen/weekly-operations";
import {
  activeWeeklyPurchasing,
  plannedDeliveryDate,
  weeklyPurchasePlan,
} from "@/lib/kitchen/weekly-purchasing";
import { approveMenuFixture } from "./weekly-fixtures";

// Wednesday Nov 11, 2026: purchasing week Nov 16–22, planning week Nov 23–29.
const now = new Date(2026, 10, 11, 9, 30);
const WEEK = "week-2026-11-23";
const START = "2026-11-23";

function approvedWeek(base: KitchenState = initialState(), start = START): KitchenState {
  const s = { ...base, weeklyPlans: [createWeeklyPlan(start, now)] };
  return approveMenuFixture(s, `week-${start}`, now);
}
const planOf = (s: KitchenState, id = WEEK) =>
  weeklyPurchasePlan(
    s,
    s.weeklyPlans!.find((p) => p.id === id)!,
    now,
  );
const approve = (s: KitchenState, p: PurchaseProposal) =>
  reducer(
    s,
    {
      type: "approvePurchase",
      proposalId: p.id,
      lines: p.lines,
      modified: false,
      summary: `Approved ${p.vendor}`,
      vendor: p.vendor,
      deliveryDate: p.deliveryDate!,
      serviceWeekId: p.serviceWeekId,
    },
    now,
  );

/** Ingredient demand for the seven service dates, straight from the shared daily analysis. */
function weekDemand(s: KitchenState, start = START) {
  const demand: Record<string, number> = {};
  for (let i = 0; i < 7; i++) {
    const result = analyzeMenuDay(s, daysBetween("2026-11-11", addDays(start, i)), now);
    for (const [id, qty] of Object.entries(result.demand))
      demand[id] = Math.round(((demand[id] ?? 0) + qty) * 100) / 100;
  }
  return demand;
}

describe("weekly purchasing recommendations", () => {
  it("waits for an approved weekly menu", () => {
    const s = { ...initialState(), weeklyPlans: [createWeeklyPlan(START, now)] };
    const plan = planOf(s);
    expect(plan.state).toBe("awaiting-menu");
    expect(plan.rows).toEqual([]);
    expect(plan.proposals).toEqual([]);
  });

  it("matches the selected week's recipes and resident alternatives", () => {
    const s = approvedWeek();
    const plan = planOf(s);
    const demand = weekDemand(s);
    expect(plan.rows.length).toBeGreaterThan(0);
    for (const row of plan.rows)
      expect(row.requiredDuringService).toBeCloseTo(demand[row.ingredientId] ?? 0, 2);
    expect(
      Object.entries(demand)
        .filter(([, q]) => q > 0)
        .map(([id]) => id)
        .sort(),
    ).toEqual(plan.rows.map((r) => r.ingredientId).sort());
    // Every proposal belongs to this service week.
    expect(plan.proposals.every((p) => p.serviceWeekId === WEEK)).toBe(true);
  });

  it("breaks each ingredient into on-hand, planned use, incoming, projected and required stock", () => {
    const s = approvedWeek();
    for (const row of planOf(s).rows) {
      expect(row.onHand).toBe(s.ingredients.find((i) => i.id === row.ingredientId)?.stock ?? 0);
      // Projected usable = on hand − planned use + incoming before service (never below zero).
      expect(row.projectedUsable).toBeCloseTo(
        Math.max(0, row.onHand - row.plannedUseBeforeService + row.incomingBeforeService),
        2,
      );
      expect(row.proposedQty).toBeGreaterThanOrEqual(row.shortfall);
      if (row.shortfall === 0) expect(row.proposedQty).toBe(0);
    }
  });

  it("considers stock on hand and incoming orders", () => {
    const s = approvedWeek();
    const short = planOf(s).rows.find((r) => r.shortfall > 0)!;
    expect(short).toBeDefined();
    const stocked = {
      ...s,
      ingredients: s.ingredients.map((i) =>
        i.id === short.ingredientId ? { ...i, stock: i.stock + 10000 } : i,
      ),
    };
    expect(planOf(stocked).rows.find((r) => r.ingredientId === short.ingredientId)!.shortfall).toBe(
      0,
    );
    const ordered: KitchenState = {
      ...s,
      orders: [
        ...(s.orders ?? []),
        {
          id: "pre-order",
          vendor: short.vendor,
          lines: [
            {
              ingredientId: short.ingredientId,
              shortage: short.shortfall,
              qty: short.shortfall + 1000,
            },
          ],
          deliveryDate: "2026-11-20",
          status: "incoming",
        },
      ],
      ingredients: s.ingredients.map((i) =>
        i.id === short.ingredientId ? { ...i, onOrder: i.onOrder + short.shortfall + 1000 } : i,
      ),
    };
    const row = planOf(ordered).rows.find((r) => r.ingredientId === short.ingredientId)!;
    expect(row.incomingBeforeService).toBeGreaterThanOrEqual(short.shortfall + 1000);
    expect(row.shortfall).toBe(0);
  });

  it("never changes physical stock when the menu is approved or purchasing approved", () => {
    const base = initialState();
    const s = approvedWeek(base);
    expect(s.ingredients).toEqual(base.ingredients);
    let next = s;
    for (const p of planOf(s).proposals) next = approve(next, p);
    expect(next.ingredients.map((i) => i.stock)).toEqual(base.ingredients.map((i) => i.stock));
    // Approval places incoming orders only; delivery still requires receiving them.
    const orders = (next.orders ?? []).filter((o) => o.serviceWeekId === WEEK);
    expect(orders.length).toBeGreaterThan(0);
    expect(orders.every((o) => o.status === "incoming")).toBe(true);
  });

  it("approves weekly purchasing separately once every request is decided", () => {
    let s = approvedWeek();
    const plan = planOf(s);
    expect(plan.state).toBe("needs-review");
    expect(s.weeklyPlans![0]!.purchasingStatus).toBe("not-started");
    const [first, ...rest] = plan.proposals;
    s = approve(s, first!);
    expect(planOf(s).proposals.some((p) => p.id === first!.id)).toBe(false);
    if (rest.length) expect(s.weeklyPlans![0]!.purchasingStatus).toBe("needs-review");
    for (const p of planOf(s).proposals) s = approve(s, p);
    expect(planOf(s).proposals).toEqual([]);
    expect(s.weeklyPlans![0]!.purchasingStatus).toBe("approved");
    expect(weekStatus(s, START, now).status).toBe("ready-for-service");
    // The approved orders now count as incoming, so no shortfall remains.
    expect(planOf(s).rows.every((r) => r.shortfall === 0)).toBe(true);
  });

  it("keeps rejected requests' shortfall visible", () => {
    let s = approvedWeek();
    const p = planOf(s).proposals[0]!;
    s = reducer(
      s,
      {
        type: "reject",
        proposalId: p.id,
        kind: "purchase",
        summary: "Rejected",
        serviceWeekId: WEEK,
      },
      now,
    );
    const plan = planOf(s);
    expect(plan.rejected.map((x) => x.id)).toContain(p.id);
    expect(plan.flags.join(" ")).toMatch(/rejected request/);
  });

  it("lets the manager confirm a week with nothing to order", () => {
    const base = initialState();
    let s = approvedWeek({
      ...base,
      ingredients: base.ingredients.map((i) => ({ ...i, stock: 100000 })),
    });
    expect(planOf(s).proposals).toEqual([]);
    expect(planOf(s).state).toBe("ready-to-confirm");
    s = reducer(s, { type: "approveWeeklyPurchasing", id: WEEK }, now);
    expect(s.weeklyPlans![0]!.purchasingStatus).toBe("approved");
  });

  it("invalidates the recommendation when an approved menu changes", () => {
    let s = approvedWeek();
    for (const p of planOf(s).proposals) s = approve(s, p);
    expect(s.weeklyPlans![0]!.purchasingStatus).toBe("approved");
    const slot = "2026-11-25";
    const current = analyzeMenuDay(s, daysBetween("2026-11-11", slot), now);
    const other = Object.keys(current.served.lunch).length ? "l-lentil" : "l-club";
    s = reducer(s, { type: "setScheduledMain", date: slot, meal: "lunch", dishId: other }, now);
    const week = s.weeklyPlans![0]!;
    expect(week.menuStatus).toBe("needs-review");
    expect(week.purchasingStatus).toBe("needs-review");
    const plan = planOf(s);
    expect(plan.state).toBe("awaiting-menu");
    expect(plan.invalidated).toBe(true);
    expect(plan.proposals).toEqual([]);
    // Orders already placed stay on order rather than being silently cancelled.
    expect(plan.orders.every((o) => o.status === "incoming")).toBe(true);
  });
});

describe("delivery and freshness assumptions", () => {
  it("delivers by the Sunday before service unless the lead time is later", () => {
    expect(plannedDeliveryDate(START, 2, now)).toBe("2026-11-22");
    expect(plannedDeliveryDate("2026-11-16", 7, now)).toBe("2026-11-18");
  });

  it("uses ingredient shelf life, then catalog assumptions, and flags missing data", () => {
    expect(shelfLife({ id: "salmon", shelfLifeDays: 1 }, "salmon")).toEqual({
      days: 1,
      source: "ingredient",
    });
    expect(shelfLife({ id: "salmon" }, "salmon")).toEqual({ days: 2, source: "assumed" });
    expect(shelfLife(undefined, "dragon-fruit")).toEqual({ days: null, source: "missing" });
  });

  it("splits short-lived ingredients into deliveries within their shelf life", () => {
    const base = approvedWeek();
    const row = planOf(base).rows.find(
      (r) => Object.keys(r).length && r.requiredDuringService > 0 && r.shortfall > 0,
    )!;
    const s = {
      ...base,
      ingredients: base.ingredients.map((i) =>
        i.id === row.ingredientId ? { ...i, stock: 0, shelfLifeDays: 1 } : i,
      ),
    };
    const fresh = planOf(s).rows.find((r) => r.ingredientId === row.ingredientId)!;
    expect(fresh.shelfLifeSource).toBe("ingredient");
    const needDates = new Set(fresh.batches.map((b) => b.neededDate));
    expect(fresh.batches.length).toBe(needDates.size);
    expect(fresh.batches.length).toBeGreaterThan(1);
    for (const b of fresh.batches)
      expect(b.deliveryDate <= b.neededDate || b.deliveryDate === "2026-11-22").toBe(true);
    expect(fresh.flags.join(" ")).toMatch(/Split into/);
  });

  it("does not let an approved early delivery cover needs after it spoils", () => {
    let s = approvedWeek();
    const before = planOf(s);
    const split = before.rows.find((r) => r.batches.length > 1)!;
    expect(split).toBeDefined();
    const [first, second] = split.batches;
    const firstRequest = before.proposals.find(
      (p) =>
        p.deliveryDate === first!.deliveryDate &&
        p.lines.some((l) => l.ingredientId === split.ingredientId),
    )!;
    s = approve(s, firstRequest);
    const after = planOf(s);
    const later = after.proposals
      .flatMap((p) => p.lines.map((l) => ({ ...l, deliveryDate: p.deliveryDate })))
      .find(
        (l) => l.ingredientId === split.ingredientId && l.deliveryDate === second!.deliveryDate,
      );
    expect(later?.qty).toBe(second!.qty);
  });

  it("delivers short-lived stock close to the day it is needed", () => {
    for (const row of planOf(approvedWeek()).rows) {
      for (const b of row.batches) {
        if (row.shelfLifeDays && b.deliveryDate !== "2026-11-22")
          expect(b.deliveryDate).toBe(addDays(b.neededDate, -1));
        if (row.shelfLifeDays)
          expect(b.neededDate <= addDays(b.deliveryDate, row.shelfLifeDays - 1)).toBe(true);
      }
    }
  });

  it("lists active weeks only while they have not ended", () => {
    const s = approvedWeek();
    expect(activeWeeklyPurchasing(s, now).map((p) => p.weekId)).toEqual([WEEK]);
    expect(activeWeeklyPurchasing(s, new Date(2026, 11, 1, 9))).toEqual([]);
  });
});
