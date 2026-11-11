import { describe, expect, it } from "vitest";
import { DISHES, initialState } from "@/lib/kitchen/data";
import { reducer } from "@/lib/kitchen/store";
import type { KitchenState } from "@/lib/kitchen/types";
import {
  WORKFLOW_STEPS, latestRunFor, migrateAgentWorkflow, pendingRevisions, projectWeekInventory, runEvents, weekShortages,
  type AgentEvent,
} from "@/lib/kitchen/agent-workflow";
import { weeklyMenu } from "@/lib/kitchen/weekly-menu";
import { approveAlternatives } from "./weekly-fixtures";

// Wednesday Nov 11, 2026: planning week is Nov 23–29.
const now = new Date(2026, 10, 11, 9, 30);
const later = (minutes: number) => new Date(now.getTime() + minutes * 60000);
const WEEK = "week-2026-11-23";

const start = (s: KitchenState, date = "2026-11-23", at = now) => reducer(s, { type: "startWeeklyWorkflow", date }, at);
const run = (s: KitchenState, week = WEEK) => latestRunFor(s, week)!;
const advance = (s: KitchenState, week = WEEK, steps = 1) => {
  for (let i = 0; i < steps; i++) s = reducer(s, { type: "advanceWeeklyWorkflow", runId: run(s, week).workflowRunId }, later(i + 1));
  return s;
};
const finish = (s: KitchenState, week = WEEK) => advance(s, week, WORKFLOW_STEPS - run(s, week).step);
const events = (s: KitchenState, week = WEEK) => runEvents(s, run(s, week).workflowRunId);
const byAction = (s: KitchenState, action: AgentEvent["action"], week = WEEK) => events(s, week).filter((e) => e.action === action);

/**
 * Empties stock of an ingredient Monday's breakfast relies on. With `leadTimeDays` long enough
 * that no new order arrives before Monday, this is a real menu conflict.
 */
function starveIngredient(s: KitchenState, leadTimeDays = 14, week = WEEK) {
  const menu = weeklyMenu(s, week, now);
  const dish = DISHES.find((d) => d.id === menu.slots[0]!.dishId)!;
  const ingredientId = dish.ingredients[0]!.id;
  return {
    ingredientId,
    state: {
      ...s,
      leadTimeDays,
      ingredients: s.ingredients.map((i) => (i.id === ingredientId ? { ...i, stock: 0, onOrder: 0 } : i)),
      orders: (s.orders ?? []).map((o) => ({ ...o, lines: o.lines.filter((l) => l.ingredientId !== ingredientId) })),
    },
  };
}

describe("weekly agent workflow", () => {
  it("starts on Generate, selects the week and refuses overlapping runs", () => {
    const s = start(initialState());
    expect(run(s)).toMatchObject({ serviceWeekId: WEEK, status: "running", step: 0 });
    expect(s.selectedWeekId).toBe(WEEK);
    expect(s.weeklyPlans?.find((p) => p.id === WEEK)?.menuStatus).toBe("generating");
    expect(start(s, "2026-11-26", later(1))).toBe(s);
    expect(s.workflowRuns).toHaveLength(1);
  });

  it("runs dietary review, menu generation, inventory, revisions and validation, then pauses for review", () => {
    const s = finish(start(initialState()));
    expect(run(s)).toMatchObject({ status: "awaiting-approval", step: WORKFLOW_STEPS });
    expect(s.weeklyPlans?.find((p) => p.id === WEEK)?.menuStatus).toBe("needs-review");
    const all = events(s);
    expect(all[0]).toMatchObject({ sendingAgent: "dietary", receivingAgent: "menu", action: "share-dietary-constraints", stage: 1 });
    expect(all[1]).toMatchObject({ sendingAgent: "menu", receivingAgent: "inventory", action: "send-ingredient-requirements", stage: 2 });
    expect(all.at(-1)).toMatchObject({ sendingAgent: "team", receivingAgent: "manager", action: "request-approval", status: "pending" });
    for (const e of all) {
      expect(e).toMatchObject({ serviceWeekId: WEEK, workflowRunId: run(s).workflowRunId });
      expect(e.eventId).toMatch(/^run-week-2026-11-23-\d+-e\d+$/);
      expect(typeof e.timestamp).toBe("number");
      expect(e.summary.length).toBeGreaterThan(0);
      expect(e.result.length).toBeGreaterThan(0);
    }
    expect(new Set(all.map((e) => e.eventId)).size).toBe(all.length);
    // The generated menu lives in the shared daily schedule.
    expect(weeklyMenu(s, WEEK, now).savedSlots).toBe(21);
  });

  it("reports the actual residents' restrictions", () => {
    const base = initialState();
    const restricted = base.residents.filter((r) => r.allergens.length || r.diets.length || /halal|\bvegan\b/i.test(`${r.careProfile?.["Diet Type"] ?? ""} ${r.careProfile?.["Religious/Cultural Requirements"] ?? ""}`)).length;
    const s = advance(start(base));
    const payload = events(s)[0]!.structuredPayload;
    expect(payload).toMatchObject({ kind: "dietary-constraints", residentsTotal: base.residents.length, restrictedResidents: restricted });
    const fewer = advance(start({ ...base, residents: base.residents.slice(0, 3) }));
    expect(events(fewer)[0]!.structuredPayload).toMatchObject({ residentsTotal: 3 });
  });

  it("turns a real inventory shortage into a shortage handoff, a revision and a purchase draft", () => {
    let s = advance(start(initialState()), WEEK, 2);
    const starved = starveIngredient(s);
    s = finish(starved.state);
    const shortage = byAction(s, "report-shortage").find((e) => e.structuredPayload.kind === "shortage" && e.structuredPayload.finding.ingredientId === starved.ingredientId)!;
    expect(shortage).toMatchObject({ sendingAgent: "inventory", receivingAgent: "menu", status: "warning" });
    const expected = weekShortages(projectWeekInventory(starved.state, s.weeklyPlans!.find((p) => p.id === WEEK)!, now)).find((f) => f.ingredientId === starved.ingredientId)!;
    expect(shortage.structuredPayload).toMatchObject({ kind: "shortage", finding: { shortfall: expected.shortfall, weekRequirement: expected.weekRequirement } });
    expect(shortage.affectedDate! >= "2026-11-23" && shortage.affectedDate! <= "2026-11-29").toBe(true);
    expect(shortage.affectedMeal).not.toBeNull();

    // One proposal per meal; it avoids every conflict ingredient reported for that meal.
    const proposal = byAction(s, "propose-revision").find((e) => e.structuredPayload.kind === "revision" && e.affectedDate === shortage.affectedDate && e.affectedMeal === shortage.affectedMeal)!;
    if (proposal.structuredPayload.kind !== "revision") throw new Error("expected a revision");
    const p = proposal.structuredPayload.proposal;
    expect(DISHES.find((d) => d.id === p.toDishId)!.ingredients.some((i) => i.id === starved.ingredientId)).toBe(false);
    expect([p.date, p.meal]).toEqual([shortage.affectedDate, shortage.affectedMeal]);

    const purchase = byAction(s, "recommend-purchase")[0]!;
    expect(purchase.receivingAgent).toBe("manager");
    if (purchase.structuredPayload.kind !== "purchase") throw new Error("expected a purchase draft");
    const line = purchase.structuredPayload.lines.find((l) => l.ingredientId === starved.ingredientId)!;
    expect(line.qty).toBeGreaterThanOrEqual(expected.shortfall);

    const checks = events(s).filter((e) => e.structuredPayload.kind === "revalidation" && e.structuredPayload.proposalEventId === proposal.eventId);
    expect(checks.map((e) => e.action)).toEqual(["revalidate-dietary", "revalidate-inventory"]);
    // Nothing is applied before the manager decides.
    expect(s.scheduledPlans?.[p.date]?.[p.meal]).toBe(p.fromDishId);
  });

  it("treats shortages that can still be delivered in time as purchasing, not menu conflicts", () => {
    let s = advance(start(initialState()), WEEK, 2);
    const starved = starveIngredient(s, 2);
    s = finish(starved.state);
    const summary = events(s).find((e) => e.structuredPayload.kind === "purchasable-shortages")!;
    expect(summary).toMatchObject({ sendingAgent: "inventory", receivingAgent: "menu", status: "completed" });
    if (summary.structuredPayload.kind !== "purchasable-shortages") throw new Error("expected purchasable shortages");
    expect(summary.structuredPayload.findings.map((f) => f.ingredientId)).toContain(starved.ingredientId);
    expect(events(s).some((e) => e.structuredPayload.kind === "revision" && e.structuredPayload.proposal.ingredientId === starved.ingredientId)).toBe(false);
    const purchase = byAction(s, "recommend-purchase")[0]!;
    if (purchase.structuredPayload.kind !== "purchase") throw new Error("expected a purchase draft");
    expect(purchase.structuredPayload.lines.map((l) => l.ingredientId)).toContain(starved.ingredientId);
  });

  it("never proposes the same dish for two meals in one pass", () => {
    let s = advance(start(initialState()), WEEK, 2);
    s = finish(starveIngredient(s).state);
    const proposed = pendingRevisions(s, run(s).workflowRunId).flatMap((e) => (e.structuredPayload.kind === "revision" ? [e.structuredPayload.proposal.toDishId] : []));
    expect(new Set(proposed).size).toBe(proposed.length);
  });

  it("stops for human review and applies only the manager's decisions", () => {
    let s = advance(start(initialState()), WEEK, 2);
    s = finish(starveIngredient(s).state);
    const runId = run(s).workflowRunId;
    const pending = pendingRevisions(s, runId);
    expect(pending.length).toBeGreaterThan(0);
    expect(reducer(s, { type: "approveWeeklyMenu", id: WEEK }, later(10))).toBe(s);

    const first = pending[0]!;
    if (first.structuredPayload.kind !== "revision") throw new Error("expected a revision");
    const p = first.structuredPayload.proposal;
    s = reducer(s, { type: "decideWeeklyRevision", eventId: first.eventId, decision: "approve" }, later(11));
    expect(s.scheduledPlans?.[p.date]?.[p.meal]).toBe(p.toDishId);
    for (const e of pendingRevisions(s, runId)) s = reducer(s, { type: "decideWeeklyRevision", eventId: e.eventId, decision: "decline" }, later(12));
    expect(pendingRevisions(s, runId)).toEqual([]);

    // Resident alternatives are approved by the manager in the Approval Center first.
    s = approveAlternatives(s, WEEK, later(12));
    s = reducer(s, { type: "approveWeeklyMenu", id: WEEK }, later(13));
    expect(s.weeklyPlans?.find((p) => p.id === WEEK)?.menuStatus).toBe("approved");
    expect(run(s).status).toBe("completed");
    expect(events(s).at(-1)).toMatchObject({ action: "approve-week", sendingAgent: "manager" });
    expect(start(s, "2026-11-23", later(14))).toBe(s);
  });

  it("offers another safe option on request and revalidates it", () => {
    let s = advance(start(initialState()), WEEK, 2);
    s = finish(starveIngredient(s).state);
    const first = pendingRevisions(s, run(s).workflowRunId)[0]!;
    if (first.structuredPayload.kind !== "revision") throw new Error("expected a revision");
    s = reducer(s, { type: "requestAnotherWeeklyRevision", eventId: first.eventId }, later(20));
    const next = pendingRevisions(s, run(s).workflowRunId).find((e) => e.affectedDate === first.affectedDate && e.affectedMeal === first.affectedMeal)!;
    if (next.structuredPayload.kind !== "revision") throw new Error("expected a revision");
    expect(next.eventId).not.toBe(first.eventId);
    expect(next.structuredPayload.proposal.toDishId).not.toBe(first.structuredPayload.proposal.toDishId);
    expect(events(s).filter((e) => e.structuredPayload.kind === "revalidation" && e.structuredPayload.proposalEventId === next.eventId)).toHaveLength(2);
    const nextDishId = next.structuredPayload.proposal.toDishId;
    expect(DISHES.find((d) => d.id === nextDishId)!.meal).toBe(first.affectedMeal);
  });

  it("keeps each week's activity separate", () => {
    let s = finish(start(initialState()));
    s = finish(start(s, "2026-11-30", later(30)), "week-2026-11-30");
    const a = events(s, WEEK);
    const b = events(s, "week-2026-11-30");
    expect(a.every((e) => e.serviceWeekId === WEEK)).toBe(true);
    expect(b.every((e) => e.serviceWeekId === "week-2026-11-30")).toBe(true);
    expect(a[0]!.summary).not.toBe(b[0]!.summary);
    expect(weeklyMenu(s, "week-2026-11-30", now).slots.map((x) => x.dishId)).not.toEqual(weeklyMenu(s, WEEK, now).slots.map((x) => x.dishId));
  });

  it("survives a save and reload, and resumes a run mid-way", () => {
    const s = advance(start(initialState()), WEEK, 3);
    const reloaded = migrateAgentWorkflow(JSON.parse(JSON.stringify(s)) as KitchenState);
    expect(reloaded.agentEvents).toEqual(s.agentEvents);
    expect(run(reloaded)).toEqual(run(s));
    const resumed = finish(reloaded);
    expect(run(resumed).status).toBe("awaiting-approval");
    expect(migrateAgentWorkflow(initialState())).toMatchObject({ workflowRuns: [], agentEvents: [] });
  });

  it("supersedes an unfinished review when the plan is regenerated, and refuses ended weeks", () => {
    let s = finish(start(initialState()));
    const firstRun = run(s).workflowRunId;
    s = start(s, "2026-11-23", later(40));
    expect(s.workflowRuns?.find((r) => r.workflowRunId === firstRun)?.status).toBe("superseded");
    expect(run(s).status).toBe("running");
    expect(start(initialState(), "2026-11-02")).toEqual(initialState());
  });
});
