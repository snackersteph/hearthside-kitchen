import { describe, expect, it } from "vitest";
import { DISHES, initialState } from "@/lib/kitchen/data";
import { resolveMenuState } from "@/lib/kitchen/engine";
import { reducer } from "@/lib/kitchen/store";
import type { KitchenState, PurchaseProposal } from "@/lib/kitchen/types";
import {
  WORKFLOW_STEPS,
  latestRunFor,
  pendingRevisions,
  runEvents,
  weeklyApprovalChecks,
} from "@/lib/kitchen/agent-workflow";
import { weeklyMenu } from "@/lib/kitchen/weekly-menu";
import { lifecycleDates, daysBetween } from "@/lib/kitchen/weekly-schedule";
import { weekStatus, weeklyWorkstreams } from "@/lib/kitchen/weekly-operations";
import { weeklyPurchasePlan } from "@/lib/kitchen/weekly-purchasing";
import { approveAlternatives } from "./weekly-fixtures";

// Fictional service week Nov 30 – Dec 6, 2026:
//   planning Nov 16–22 · purchasing Nov 23–29 · service Nov 30 – Dec 6.
const WEEK = "week-2026-11-30";
const START = "2026-11-30";
const planning = new Date(2026, 10, 17, 9, 0); // Tue Nov 17
const purchasing = new Date(2026, 10, 24, 9, 0); // Tue Nov 24
const service = new Date(2026, 11, 1, 9, 0); // Tue Dec 1
const at = (base: Date, minutes: number) => new Date(base.getTime() + minutes * 60000);

const plan = (s: KitchenState) => s.weeklyPlans!.find((p) => p.id === WEEK)!;
const run = (s: KitchenState) => latestRunFor(s, WEEK)!;
const events = (s: KitchenState) => runEvents(s, run(s).workflowRunId);
const advance = (s: KitchenState, steps: number, base = planning) => {
  for (let i = 0; i < steps; i++)
    s = reducer(s, { type: "advanceWeeklyWorkflow", runId: run(s).workflowRunId }, at(base, i + 1));
  return s;
};
const approvePurchase = (s: KitchenState, p: PurchaseProposal, when: Date) =>
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
    when,
  );
/** Everything dated before the service week, to prove earlier weeks are never touched. */
const earlier = (s: KitchenState) =>
  JSON.stringify(
    [s.scheduledPlans, s.scheduledOverrides, s.mealApprovals, s.mealRejections].map((m) =>
      Object.fromEntries(Object.entries(m ?? {}).filter(([date]) => date < START)),
    ),
  );

/** Runs the scenario up to the point the manager reviews the week, with a real ingredient shortage. */
function plannedWeekWithShortage() {
  const base = initialState();
  // Step 1–2: the manager selects Nov 30 and generates the plan (planning phase, Nov 17).
  let s = reducer(base, { type: "startWeeklyWorkflow", date: START }, planning);
  s = advance(s, 2); // dietary review + 21-meal generation
  // Fictional supply problem: Monday breakfast's first ingredient is out, and the supplier
  // quotes 14 days, so it cannot be bought in time and the menu itself must change.
  const monday = weeklyMenu(s, WEEK, planning).slots[0]!;
  const ingredientId = DISHES.find((d) => d.id === monday.dishId)!.ingredients[0]!.id;
  s = {
    ...s,
    leadTimeDays: 14,
    ingredients: s.ingredients.map((i) =>
      i.id === ingredientId ? { ...i, stock: 0, onOrder: 0 } : i,
    ),
    orders: (s.orders ?? []).map((o) => ({
      ...o,
      lines: o.lines.filter((l) => l.ingredientId !== ingredientId),
    })),
  };
  s = advance(s, WORKFLOW_STEPS - run(s).step, at(planning, 10));
  return { s, base, ingredientId, monday };
}

/** Steps 10–11: approve the substitution, resident alternatives, then the weekly menu. */
function approvedWeek() {
  const scenario = plannedWeekWithShortage();
  let s = scenario.s;
  for (const e of pendingRevisions(s, run(s).workflowRunId))
    s = reducer(
      s,
      { type: "decideWeeklyRevision", eventId: e.eventId, decision: "approve" },
      at(planning, 30),
    );
  s = approveAlternatives(s, WEEK, at(planning, 31));
  // Supplier confirms its normal two-day lead time before purchasing.
  s = reducer(s, { type: "setLeadTime", days: 2 }, at(planning, 32));
  s = reducer(s, { type: "approveWeeklyMenu", id: WEEK }, at(planning, 40));
  return { ...scenario, s };
}

describe("end-to-end: service week Nov 30 – Dec 6, 2026", () => {
  it("uses the expected lifecycle dates", () => {
    expect(lifecycleDates(START)).toMatchObject({
      planningStart: "2026-11-16",
      planningEnd: "2026-11-22",
      purchasingStart: "2026-11-23",
      purchasingEnd: "2026-11-29",
      serviceStart: "2026-11-30",
      serviceEnd: "2026-12-06",
    });
    expect(weekStatus(initialState(), START, planning).phase).toBe("planning");
    expect(weekStatus(initialState(), START, purchasing).phase).toBe("purchasing");
    expect(weekStatus(initialState(), START, service).phase).toBe("service");
  });

  it("steps 1–9: selects the week, generates 21 meals, finds a shortage and revalidates a revision", () => {
    const { s, base, ingredientId, monday } = plannedWeekWithShortage();
    // 1. Week selected
    expect(s.selectedWeekId).toBe(WEEK);
    // 2/4. 21 meals across breakfast, lunch and dinner for all seven days
    const menu = weeklyMenu(s, WEEK, planning);
    expect(menu.savedSlots).toBe(21);
    expect(new Set(menu.slots.map((x) => x.date)).size).toBe(7);
    expect(new Set(menu.slots.map((x) => x.meal))).toEqual(
      new Set(["breakfast", "lunch", "dinner"]),
    );
    const all = events(s);
    // 3. Dietary Agent shares real resident restrictions
    expect(all[0]).toMatchObject({
      sendingAgent: "dietary",
      receivingAgent: "menu",
      action: "share-dietary-constraints",
    });
    // 5. Inventory Agent receives ingredient requirements
    expect(
      all.some(
        (e) => e.action === "send-ingredient-requirements" && e.receivingAgent === "inventory",
      ),
    ).toBe(true);
    // 6–7. A shortage that cannot be purchased in time is handed to the Menu Agent
    const shortage = all.find(
      (e) =>
        e.structuredPayload.kind === "shortage" &&
        e.structuredPayload.finding.ingredientId === ingredientId,
    );
    expect(shortage).toMatchObject({
      sendingAgent: "inventory",
      receivingAgent: "menu",
      action: "report-shortage",
      affectedDate: START,
    });
    // 8. Menu Agent proposes a replacement for that meal
    const revision = pendingRevisions(s, run(s).workflowRunId).find(
      (e) => e.affectedDate === monday.date && e.affectedMeal === monday.meal,
    );
    expect(revision?.structuredPayload.kind).toBe("revision");
    const payload = revision?.structuredPayload;
    if (!revision || payload?.kind !== "revision") return;
    const toDishId = payload.proposal.toDishId;
    const replacement = DISHES.find((d) => d.id === toDishId)!;
    expect(replacement.ingredients.some((i) => i.id === ingredientId)).toBe(false);
    // 9. Dietary and inventory validation run again for the proposal
    const rechecks = all
      .filter(
        (e) =>
          e.structuredPayload.kind === "revalidation" &&
          e.structuredPayload.proposalEventId === revision.eventId,
      )
      .map((e) => e.action);
    expect(rechecks).toEqual(
      expect.arrayContaining(["revalidate-dietary", "revalidate-inventory"]),
    );
    // Nothing changes until the manager decides; the week waits for review.
    expect(weeklyMenu(s, WEEK, planning).slots[0]!.dishId).toBe(monday.dishId);
    expect(run(s).status).toBe("awaiting-approval");
    expect(weekStatus(s, START, planning).status).toBe("needs-review");
    // Stock was not deducted by planning.
    for (const i of s.ingredients.filter((x) => x.id !== ingredientId))
      expect(i.stock).toBe(base.ingredients.find((b) => b.id === i.id)!.stock);
  });

  it("steps 10–15: approves the substitution, the week, its purchasing, and serves the approved meals", () => {
    const scenario = plannedWeekWithShortage();
    const before = earlier(scenario.s);
    let s = scenario.s;
    const revision = pendingRevisions(s, run(s).workflowRunId).find(
      (e) => e.affectedDate === scenario.monday.date,
    )!;
    if (revision.structuredPayload.kind !== "revision") throw new Error("expected a revision");
    const toDish = revision.structuredPayload.proposal.toDishId;
    // 10. Substitution approved
    s = reducer(
      s,
      { type: "decideWeeklyRevision", eventId: revision.eventId, decision: "approve" },
      at(planning, 30),
    );
    expect(weeklyMenu(s, WEEK, planning).slots[0]!.dishId).toBe(toDish);
    for (const e of pendingRevisions(s, run(s).workflowRunId))
      s = reducer(
        s,
        { type: "decideWeeklyRevision", eventId: e.eventId, decision: "approve" },
        at(planning, 31),
      );
    s = approveAlternatives(s, WEEK, at(planning, 32));
    s = reducer(s, { type: "setLeadTime", days: 2 }, at(planning, 33));
    expect(weeklyApprovalChecks(s, WEEK, at(planning, 34)).blockers).toEqual([]);
    // 11. Weekly menu approved; purchasing is opened for review, not approved
    s = reducer(s, { type: "approveWeeklyMenu", id: WEEK }, at(planning, 40));
    expect(plan(s)).toMatchObject({
      menuStatus: "approved",
      purchasingStatus: "needs-review",
      purchasingApprovedAt: null,
    });
    expect(weekStatus(s, START, planning).status).toBe("purchasing");
    // 12. Purchasing proposal generated for this service week
    const draft = weeklyPurchasePlan(s, plan(s), purchasing);
    expect(draft.state).toBe("needs-review");
    expect(draft.proposals.length).toBeGreaterThan(0);
    expect(draft.proposals.every((p) => p.serviceWeekId === WEEK)).toBe(true);
    expect(weeklyWorkstreams(s, { proposals: [] }, purchasing).purchasing.pendingOrders).toBe(
      draft.proposals.length,
    );
    // 13. Manager approves the purchase requests in the purchasing phase (Nov 24)
    const [first, ...rest] = draft.proposals;
    s = approvePurchase(s, first!, purchasing);
    // 14. Status reflects progress: still purchasing while requests remain
    if (rest.length) expect(weekStatus(s, START, purchasing).status).toBe("purchasing");
    for (const p of weeklyPurchasePlan(s, plan(s), purchasing).proposals)
      s = approvePurchase(s, p, at(purchasing, 5));
    expect(weeklyPurchasePlan(s, plan(s), purchasing).proposals).toEqual([]);
    expect(plan(s).purchasingStatus).toBe("approved");
    expect(weekStatus(s, START, purchasing).status).toBe("ready-for-service");
    // Approval is not delivery: orders are incoming and stock is unchanged.
    const orders = (s.orders ?? []).filter((o) => o.serviceWeekId === WEEK);
    expect(orders.length).toBeGreaterThan(0);
    expect(orders.every((o) => o.status === "incoming")).toBe(true);
    expect(s.ingredients.map((i) => i.stock)).toEqual(scenario.s.ingredients.map((i) => i.stock));
    // 15. During service the week shows the approved, locked meals, matching the daily menu.
    const served = weeklyMenu(s, WEEK, service);
    expect(weekStatus(s, START, service).status).toBe("in-service");
    for (const slot of served.slots.filter((x) => x.date >= "2026-12-01")) {
      expect(slot.lock).toBe("approved-week");
      expect(slot.dishId).toBe(
        resolveMenuState(s, daysBetween("2026-12-01", slot.date), service).plan[slot.meal],
      );
    }
    expect(
      served.slots.find((x) => x.date === START && x.meal === scenario.monday.meal)!.dishId,
    ).toBe(toDish);
    // Earlier weeks were never modified.
    expect(earlier(s)).toBe(before);
  });
});

describe("end-to-end edge cases", () => {
  it("prevents double approval and duplicate orders", () => {
    const { s } = approvedWeek();
    expect(reducer(s, { type: "approveWeeklyMenu", id: WEEK }, at(planning, 50))).toBe(s);
    expect(reducer(s, { type: "startWeeklyWorkflow", date: START }, at(planning, 50))).toBe(s);
    const p = weeklyPurchasePlan(s, plan(s), purchasing).proposals[0]!;
    const once = approvePurchase(s, p, purchasing);
    const twice = approvePurchase(once, p, at(purchasing, 1));
    expect(twice.orders).toEqual(once.orders);
    expect(twice.ingredients).toEqual(once.ingredients);
    expect(twice.history).toEqual(once.history);
    // A decided request cannot be rejected afterwards either.
    expect(
      reducer(
        once,
        {
          type: "reject",
          proposalId: p.id,
          kind: "purchase",
          summary: "late reject",
          serviceWeekId: WEEK,
        },
        at(purchasing, 2),
      ),
    ).toBe(once);
  });

  it("re-plans an approved week after a recipe edit without re-ordering what is already on order", () => {
    let { s } = approvedWeek();
    const first = weeklyPurchasePlan(s, plan(s), purchasing);
    for (const p of first.proposals) s = approvePurchase(s, p, purchasing);
    expect(plan(s).purchasingStatus).toBe("approved");
    const before = earlier(s);
    // Edit one approved assignment (Wed dinner).
    const slot = weeklyMenu(s, WEEK, purchasing).slots.find(
      (x) => x.date === "2026-12-02" && x.meal === "dinner",
    )!;
    const other = DISHES.find(
      (d) => d.meal === "dinner" && d.id !== slot.dishId && !d.tags.includes("pureed"),
    )!;
    s = reducer(
      s,
      { type: "setScheduledMain", date: slot.date, meal: "dinner", dishId: other.id },
      at(purchasing, 10),
    );
    expect(plan(s)).toMatchObject({ menuStatus: "needs-review", purchasingStatus: "needs-review" });
    expect(plan(s).revalidationSlots).toContain("2026-12-02|dinner");
    expect(weeklyPurchasePlan(s, plan(s), purchasing)).toMatchObject({
      state: "awaiting-menu",
      invalidated: true,
      proposals: [],
    });
    expect(
      (s.orders ?? [])
        .filter((o) => o.serviceWeekId === WEEK)
        .every((o) => o.status === "incoming"),
    ).toBe(true);
    // Re-approve: only what the new dish needs beyond existing orders is requested.
    s = approveAlternatives(s, WEEK, at(purchasing, 11));
    s = reducer(s, { type: "approveWeeklyMenu", id: WEEK }, at(purchasing, 12));
    expect(plan(s).menuStatus).toBe("approved");
    const again = weeklyPurchasePlan(s, plan(s), purchasing);
    expect(again.total).toBeLessThan(first.total);
    expect(earlier(s)).toBe(before);
  });

  it("reopens the week when a resident's dietary restriction changes", () => {
    let { s } = approvedWeek();
    const resident = s.residents.find((r) => !r.allergens.includes("soy"))!;
    s = reducer(
      s,
      {
        type: "updateResident",
        resident: { ...resident, allergens: [...resident.allergens, "soy"] },
      },
      at(planning, 60),
    );
    expect(plan(s).menuStatus).toBe("needs-review");
    expect(plan(s).revalidationSlots?.length).toBe(21);
    expect(run(s).status).toBe("awaiting-approval");
    expect(events(s).at(-1)).toMatchObject({ action: "revalidation-required" });
  });

  it("keeps a staff-saved meal when the plan is generated", () => {
    const base = initialState();
    const dish = DISHES.find((d) => d.meal === "lunch" && !d.tags.includes("pureed"))!;
    let s = reducer(
      base,
      { type: "setScheduledMain", date: "2026-12-02", meal: "lunch", dishId: dish.id },
      planning,
    );
    s = reducer(s, { type: "startWeeklyWorkflow", date: START }, planning);
    s = advance(s, WORKFLOW_STEPS);
    const menu = weeklyMenu(s, WEEK, planning);
    expect(menu.savedSlots).toBe(21);
    expect(menu.slots.find((x) => x.date === "2026-12-02" && x.meal === "lunch")!.dishId).toBe(
      dish.id,
    );
  });

  it("flags missing inventory data instead of ordering it", () => {
    let { s } = approvedWeek();
    const row = weeklyPurchasePlan(s, plan(s), purchasing).rows.find(
      (r) => r.requiredDuringService > 0,
    )!;
    s = reducer(s, { type: "deleteIngredient", id: row.ingredientId }, at(purchasing, 1));
    const after = weeklyPurchasePlan(s, plan(s), purchasing);
    const missing = after.rows.find((r) => r.ingredientId === row.ingredientId)!;
    expect(missing.flags.join(" ")).toMatch(/Not in inventory/);
    expect(missing.shelfLifeSource).not.toBe("ingredient");
    expect(
      after.proposals.some((p) => p.lines.some((l) => l.ingredientId === row.ingredientId)),
    ).toBe(false);
  });

  it("reports overdue planning and purchasing without advancing the week", () => {
    // Menu still in review on Nov 23 (due Nov 22).
    const review = plannedWeekWithShortage().s;
    const late = weekStatus(review, START, new Date(2026, 10, 23, 9));
    expect(late.status).toBe("needs-review");
    expect(late.outstanding).toEqual([]);
    // Menu approved but purchasing undecided on Nov 28 (due Nov 27 with a 2-day lead time).
    const { s } = approvedWeek();
    const lateBuy = weekStatus(s, START, new Date(2026, 10, 28, 9));
    expect(lateBuy.status).toBe("purchasing");
    expect(lateBuy.outstanding.map((o) => o.kind)).toEqual(["purchasing"]);
  });

  it("does not modify other weeks", () => {
    const { s } = approvedWeek();
    expect(s.weeklyPlans!.map((p) => p.id)).toEqual([WEEK]);
    for (const key of Object.keys(s.scheduledPlans ?? {}))
      expect(key >= START && key <= "2026-12-06").toBe(true);
    for (const key of Object.keys(s.mealApprovals ?? {}))
      expect(key >= START && key <= "2026-12-06").toBe(true);
  });
});
