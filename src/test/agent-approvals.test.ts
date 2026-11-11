import { describe, expect, it } from "vitest";
import { DISHES, initialState } from "@/lib/kitchen/data";
import { analyzeMenuDay, resolveMenuState } from "@/lib/kitchen/engine";
import { reducer } from "@/lib/kitchen/store";
import type { KitchenState, Meal, Observation } from "@/lib/kitchen/types";
import {
  WORKFLOW_STEPS, latestRunFor, pendingRevisions, runEvents, weeklyApprovalChecks, type AgentEvent, type RevisionProposal,
} from "@/lib/kitchen/agent-workflow";
import { weeklyMenu } from "@/lib/kitchen/weekly-menu";
import { daysBetween } from "@/lib/kitchen/weekly-schedule";
import { approveAlternatives } from "./weekly-fixtures";

// Wednesday Nov 11, 2026; the planning week is Nov 23–29.
const now = new Date(2026, 10, 11, 9, 30);
const later = (minutes: number) => new Date(now.getTime() + minutes * 60000);
const WEEK = "week-2026-11-23";
const PUREED_DINNER = "DIN-VGN-15"; // safe for every seeded resident; never a generated main

const act = (s: KitchenState, a: Parameters<typeof reducer>[1], minutes = 0) => reducer(s, a, later(minutes));
const run = (s: KitchenState) => latestRunFor(s, WEEK)!;
const events = (s: KitchenState) => runEvents(s, run(s).workflowRunId);
const plan = (s: KitchenState) => s.weeklyPlans!.find((p) => p.id === WEEK)!;
const offset = (date: string) => daysBetween("2026-11-11", date);
const finish = (s: KitchenState) => {
  for (let i = run(s).step; i < WORKFLOW_STEPS; i++) s = act(s, { type: "advanceWeeklyWorkflow", runId: run(s).workflowRunId }, i + 1);
  return s;
};
const proposalOf = (e: AgentEvent): RevisionProposal => {
  if (e.structuredPayload.kind !== "revision") throw new Error("expected a revision");
  return e.structuredPayload.proposal;
};

/** A run with real menu conflicts: Monday breakfast's first ingredient is out and can't arrive in time. */
function conflictedRun(base = initialState()) {
  let s = act(base, { type: "startWeeklyWorkflow", date: "2026-11-23" });
  for (let i = 0; i < 2; i++) s = act(s, { type: "advanceWeeklyWorkflow", runId: run(s).workflowRunId }, i + 1);
  const ingredientId = DISHES.find((d) => d.id === weeklyMenu(s, WEEK, now).slots[0]!.dishId)!.ingredients[0]!.id;
  s = { ...s, leadTimeDays: 14, ingredients: s.ingredients.map((i) => (i.id === ingredientId ? { ...i, stock: 0, onOrder: 0 } : i)), orders: [] };
  return finish(s);
}

/** A clean run (no conflicts) with every review resolved, ready for weekly approval. */
function readyToApprove() {
  let s = finish(act(initialState(), { type: "startWeeklyWorkflow", date: "2026-11-23" }));
  s = approveAlternatives(s, WEEK, now);
  return s;
}

describe("Approve Substitution", () => {
  it("applies the recipe to the exact date and meal, so the Daily Menu shows it", () => {
    let s = conflictedRun();
    const rev = pendingRevisions(s, run(s).workflowRunId)[0]!;
    const p = proposalOf(rev);
    s = act(s, { type: "decideWeeklyRevision", eventId: rev.eventId, decision: "approve" }, 20);
    // The Daily Menu resolves dates through resolveMenuState.
    expect(resolveMenuState(s, offset(p.date), now).plan[p.meal]).toBe(p.toDishId);
    expect(s.scheduledPlans?.[p.date]?.[p.meal]).toBe(p.toDishId);
    expect(weeklyMenu(s, WEEK, now).slots.find((x) => x.date === p.date && x.meal === p.meal)!.dishId).toBe(p.toDishId);
  });

  it("keeps resident alternatives, reruns checks and records the manager's approval", () => {
    let s = conflictedRun();
    const rev = pendingRevisions(s, run(s).workflowRunId)[0]!;
    const p = proposalOf(rev);
    const resident = s.residents[0]!.id;
    const alt = DISHES.find((d) => d.meal === p.meal && d.tags.includes("pureed") && d.id !== p.toDishId)!.id;
    s = { ...s, scheduledOverrides: { ...s.scheduledOverrides, [p.date]: { ...s.scheduledOverrides?.[p.date], [p.meal]: { [resident]: alt } } } };
    s = act(s, { type: "decideWeeklyRevision", eventId: rev.eventId, decision: "approve" }, 20);
    expect(s.scheduledOverrides?.[p.date]?.[p.meal]?.[resident]).toBe(alt);
    const decision = events(s).find((e) => e.action === "approve-revision")!;
    expect(decision).toMatchObject({ sendingAgent: "manager", affectedDate: p.date, affectedMeal: p.meal });
    expect(decision.structuredPayload.facts.some((f) => f.startsWith("Dietary recheck:"))).toBe(true);
    expect(decision.structuredPayload.facts.some((f) => /still short|shortage resolved/.test(f))).toBe(true);
    expect(s.history[0]).toMatchObject({ proposalId: rev.eventId, kind: "substitution", status: "approved" });
    expect(pendingRevisions(s, run(s).workflowRunId).some((e) => e.eventId === rev.eventId)).toBe(false);
  });

  it("records a declined revision without touching the plan", () => {
    let s = conflictedRun();
    const rev = pendingRevisions(s, run(s).workflowRunId)[0]!;
    const p = proposalOf(rev);
    s = act(s, { type: "decideWeeklyRevision", eventId: rev.eventId, decision: "decline" }, 20);
    expect(s.scheduledPlans?.[p.date]?.[p.meal]).toBe(p.fromDishId);
    expect(s.history[0]).toMatchObject({ proposalId: rev.eventId, status: "rejected" });
  });
});

describe("Request Another Option", () => {
  it("proposes a different, revalidated recipe as pending without changing the plan", () => {
    let s = conflictedRun();
    const rev = pendingRevisions(s, run(s).workflowRunId)[0]!;
    const p = proposalOf(rev);
    const before = s.scheduledPlans?.[p.date]?.[p.meal];
    s = act(s, { type: "requestAnotherWeeklyRevision", eventId: rev.eventId }, 20);
    expect(s.scheduledPlans?.[p.date]?.[p.meal]).toBe(before);
    const next = pendingRevisions(s, run(s).workflowRunId).find((e) => e.affectedDate === p.date && e.affectedMeal === p.meal)!;
    expect(next.status).toBe("pending");
    expect(proposalOf(next).toDishId).not.toBe(p.toDishId);
    expect(events(s).filter((e) => e.structuredPayload.kind === "revalidation" && e.structuredPayload.proposalEventId === next.eventId).map((e) => e.action))
      .toEqual(["revalidate-dietary", "revalidate-inventory"]);
  });
});

describe("Approve Weekly Menu", () => {
  it("is blocked until required reviews are resolved, then saves approval, timestamp and meal sign-offs", () => {
    let s = finish(act(initialState(), { type: "startWeeklyWorkflow", date: "2026-11-23" }));
    const checks = weeklyApprovalChecks(s, WEEK, now);
    expect(checks.ready).toBe(false);
    expect(checks.blockers.map((b) => b.code)).toContain("pending-alternatives");
    expect(act(s, { type: "approveWeeklyMenu", id: WEEK }, 5)).toBe(s);

    s = approveAlternatives(s, WEEK, now);
    expect(weeklyApprovalChecks(s, WEEK, now)).toMatchObject({ ready: true, blockers: [] });
    s = act(s, { type: "approveWeeklyMenu", id: WEEK }, 30);
    expect(plan(s)).toMatchObject({ menuStatus: "approved", menuApprovedAt: later(30).getTime(), purchasingStatus: "needs-review" });
    expect(Object.keys(plan(s).menuApprovalSignatures ?? {})).toHaveLength(21);
    // Each meal is signed off with the existing per-meal approval, so the Daily Menu agrees.
    expect(weeklyMenu(s, WEEK, now).slots.every((x) => x.approved)).toBe(true);
    expect(s.history.some((h) => h.summary.startsWith("Approved weekly menu"))).toBe(true);
    const reloaded = JSON.parse(JSON.stringify(s)) as KitchenState;
    expect(plan(reloaded).menuStatus).toBe("approved");
  });

  it("requires all 21 slots and a completed agent review", () => {
    const s = act(initialState(), { type: "createWeeklyPlan", date: "2026-11-23" });
    const codes = weeklyApprovalChecks(s, WEEK, now).blockers.map((b) => b.code);
    expect(codes).toEqual(expect.arrayContaining(["no-review", "unplanned-slots"]));
  });

  it("blocks on critical dietary conflicts, open care updates and open meal concerns", () => {
    let s = readyToApprove();
    // A staff rejection of a resident alternative leaves that resident without a safe option.
    const date = "2026-11-24";
    const day = analyzeMenuDay(act(s, { type: "setMealPlan", date, meal: "dinner", dishId: DISHES.find((d) => d.meal === "dinner" && d.tags.includes("high-sodium"))!.id, overrides: {} }, 1), offset(date), now);
    const sub = day.proposals.find((p) => p.kind === "substitution");
    if (sub?.kind !== "substitution") throw new Error("expected a resident alternative for a high-sodium dinner");
    s = act(s, { type: "setMealPlan", date, meal: "dinner", dishId: sub.fromDishId, overrides: {} }, 1);
    s = act(s, { type: "rejectSub", proposalId: sub.id, meal: sub.meal, dishId: sub.dishId, fromDishId: sub.fromDishId, residentIds: sub.residentIds, serviceDate: date, summary: "Rejected" }, 2);
    expect(weeklyApprovalChecks(s, WEEK, now).blockers.map((b) => b.code)).toContain("dietary-conflicts");
    let t = readyToApprove();
    t = { ...t, profileUpdates: [{ id: "u1", residentId: t.residents[0]!.id, at: 1, summary: "Diet type", review: "open" }] };
    expect(weeklyApprovalChecks(t, WEEK, now).blockers.map((b) => b.code)).toContain("open-profile-updates");
    const slot = weeklyMenu(t, WEEK, now).slots[3]!;
    const resident = t.residents.find((r) => !slot.overrides[r.id])!;
    const concern: Observation = { id: "o1", residentId: resident.id, serviceDate: "2026-11-02", meal: slot.meal, dishId: slot.dishId, reaction: "Coughing", severity: "concern", status: "open", notedAt: 1 };
    t = { ...t, profileUpdates: [], observations: [concern] };
    expect(weeklyApprovalChecks(t, WEEK, now).blockers.map((b) => b.code)).toEqual(["open-concerns"]);
  });

  it("lets purchasing needs remain as separate tasks", () => {
    let s = act(initialState(), { type: "startWeeklyWorkflow", date: "2026-11-23" });
    for (let i = 0; i < 2; i++) s = act(s, { type: "advanceWeeklyWorkflow", runId: run(s).workflowRunId }, i + 1);
    const ingredientId = DISHES.find((d) => d.id === weeklyMenu(s, WEEK, now).slots[0]!.dishId)!.ingredients[0]!.id;
    s = finish({ ...s, ingredients: s.ingredients.map((i) => (i.id === ingredientId ? { ...i, stock: 0, onOrder: 0 } : i)) });
    s = approveAlternatives(s, WEEK, now);
    const checks = weeklyApprovalChecks(s, WEEK, now);
    expect(checks.purchasingTasks).toBeGreaterThan(0);
    expect(checks.ready).toBe(true);
    s = act(s, { type: "approveWeeklyMenu", id: WEEK }, 30);
    expect(plan(s)).toMatchObject({ menuStatus: "approved", purchasingStatus: "needs-review", purchasingApprovedAt: null });
  });
});

describe("Edit after approval", () => {
  const approved = () => act(readyToApprove(), { type: "approveWeeklyMenu", id: WEEK }, 30);

  it("flags a changed meal for revalidation and requires renewed approval", () => {
    let s = approved();
    const slot = weeklyMenu(s, WEEK, now).slots.find((x) => x.date === "2026-11-25" && x.meal === "dinner")!;
    s = act(s, { type: "setMealPlan", date: slot.date, meal: "dinner", dishId: PUREED_DINNER, overrides: {} }, 40);
    expect(plan(s)).toMatchObject({ menuStatus: "needs-review", menuApprovedAt: null, revalidationSlots: ["2026-11-25|dinner"] });
    const menu = weeklyMenu(s, WEEK, now);
    expect(menu.slots.filter((x) => x.needsRevalidation).map((x) => `${x.date}|${x.meal}`)).toEqual(["2026-11-25|dinner"]);
    expect(menu.slots.find((x) => x.date === slot.date && x.meal === "dinner")!.approved).toBe(false);
    expect(run(s).status).toBe("awaiting-approval");
    expect(events(s).at(-1)).toMatchObject({ action: "revalidation-required", status: "warning", affectedDate: "2026-11-25", affectedMeal: "dinner" });

    s = approveAlternatives(s, WEEK, now);
    s = act(s, { type: "approveWeeklyMenu", id: WEEK }, 50);
    expect(plan(s).menuStatus).toBe("approved");
    expect(plan(s).revalidationSlots).toBeUndefined();
  });

  it("flags every remaining meal when a resident's requirements change materially", () => {
    let s = approved();
    const resident = s.residents.find((r) => !r.allergens.includes("soy"))!;
    s = act(s, { type: "updateResident", resident: { ...resident, allergens: [...resident.allergens, "soy"] } }, 40);
    expect(plan(s).menuStatus).toBe("needs-review");
    expect(plan(s).revalidationSlots).toHaveLength(21);
    const flagged = events(s).at(-1)!;
    expect(flagged.structuredPayload).toMatchObject({ kind: "revalidation-required", residentRequirementsChanged: true });
  });

  it("keeps the approval for changes that don't affect meals", () => {
    let s = approved();
    const resident = s.residents[0]!;
    s = act(s, { type: "updateResident", resident: { ...resident, room: "999" } }, 40);
    expect(plan(s).menuStatus).toBe("approved");
  });

  it("treats a rejection of an approved meal as a revision", () => {
    let s = approved();
    s = act(s, { type: "rejectMeal", date: "2026-11-27", meal: "lunch" as Meal }, 40);
    expect(plan(s).menuStatus).toBe("needs-review");
    expect(plan(s).revalidationSlots).toEqual(["2026-11-27|lunch"]);
  });
});

describe("Agents never approve their own proposals", () => {
  it("a full run changes no approvals, decisions or proposed revisions", () => {
    const base = initialState();
    const s = conflictedRun(base);
    expect(plan(s).menuStatus).toBe("needs-review");
    expect(s.history).toEqual(base.history);
    expect(Object.values(s.mealApprovals ?? {}).flatMap((m) => Object.values(m ?? {})).filter(Boolean)).toEqual([]);
    expect(Object.values(s.scheduledOverrides ?? {}).flatMap((m) => Object.values(m ?? {})).every((o) => Object.keys(o ?? {}).length === 0)).toBe(true);
    for (const rev of pendingRevisions(s, run(s).workflowRunId)) {
      const p = proposalOf(rev);
      expect(s.scheduledPlans?.[p.date]?.[p.meal]).toBe(p.fromDishId);
    }
  });
});
