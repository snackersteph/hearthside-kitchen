import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { initialState } from "@/lib/kitchen/data";
import { analyze } from "@/lib/kitchen/engine";
import { reducer } from "@/lib/kitchen/store";
import type { KitchenState } from "@/lib/kitchen/types";
import { WORKFLOW_STEPS, latestRunFor } from "@/lib/kitchen/agent-workflow";
import { applyWeeklyStatus, createWeeklyPlan } from "@/lib/kitchen/weekly-schedule";
import {
  approvalWeekFilter,
  rollingServiceWeeks,
  weekRange,
  weekStatus,
  weeklyWorkstreams,
} from "@/lib/kitchen/weekly-operations";
import { routeTree } from "@/routeTree.gen";

// Wednesday Nov 11, 2026: service week Nov 9–15, purchasing Nov 16–22, planning Nov 23–29.
const now = new Date(2026, 10, 11, 9, 30);

/** A weekly record with the given decisions, created as the app would (snapped to its Monday). */
function withPlan(
  s: KitchenState,
  start: string,
  menu?: "needs-review" | "approved",
  purchasing?: "draft" | "approved",
): KitchenState {
  let plan = createWeeklyPlan(start, now);
  if (menu) plan = applyWeeklyStatus(plan, { menuStatus: menu }, now)!;
  if (purchasing) plan = applyWeeklyStatus(plan, { purchasingStatus: purchasing }, now)!;
  return { ...s, weeklyPlans: [...(s.weeklyPlans ?? []).filter((p) => p.id !== plan.id), plan] };
}

describe("rolling service weeks", () => {
  it("derives the three target weeks from the current date", () => {
    expect(rollingServiceWeeks(now)).toEqual({
      service: "2026-11-09",
      purchasing: "2026-11-16",
      planning: "2026-11-23",
    });
    // Sunday still belongs to the week that began on Monday; Monday starts the next cycle.
    expect(rollingServiceWeeks(new Date(2026, 10, 15, 20)).service).toBe("2026-11-09");
    expect(rollingServiceWeeks(new Date(2026, 10, 16, 6)).service).toBe("2026-11-16");
    // Crosses month and year boundaries without hardcoded dates.
    expect(rollingServiceWeeks(new Date(2026, 11, 30, 12))).toEqual({
      service: "2026-12-28",
      purchasing: "2027-01-04",
      planning: "2027-01-11",
    });
  });

  it("labels Monday–Sunday ranges across months", () => {
    expect(weekRange("2026-11-09", "2026-11-15")).toBe("Nov 9–15");
    expect(weekRange("2026-11-30", "2026-12-06")).toBe("Nov 30 – Dec 6");
  });
});

describe("weekly status", () => {
  const base = initialState();

  it("is Not Started when no agent work or weekly record exists", () => {
    expect(weekStatus(base, "2026-11-23", now).status).toBe("not-started");
    expect(weekStatus(base, "2026-11-25", now).startDate).toBe("2026-11-23");
  });

  it("follows staff decisions through planning, review and approval", () => {
    expect(weekStatus(withPlan(base, "2026-11-23"), "2026-11-23", now).status).toBe("planning");
    expect(weekStatus(withPlan(base, "2026-11-23", "needs-review"), "2026-11-23", now).status).toBe(
      "needs-review",
    );
    expect(weekStatus(withPlan(base, "2026-11-23", "approved"), "2026-11-23", now).status).toBe(
      "menu-approved",
    );
  });

  it("shows purchasing and readiness for an approved menu in its purchasing week", () => {
    expect(weekStatus(withPlan(base, "2026-11-16", "approved"), "2026-11-16", now).status).toBe(
      "purchasing",
    );
    expect(
      weekStatus(withPlan(base, "2026-11-30", "approved", "draft"), "2026-11-30", now).status,
    ).toBe("purchasing");
    expect(
      weekStatus(withPlan(base, "2026-11-16", "approved", "approved"), "2026-11-16", now).status,
    ).toBe("ready-for-service");
  });

  it("shows service and completion only for approved menus", () => {
    expect(
      weekStatus(withPlan(base, "2026-11-09", "approved", "approved"), "2026-11-09", now).status,
    ).toBe("in-service");
    expect(
      weekStatus(withPlan(base, "2026-11-02", "approved", "approved"), "2026-11-02", now).status,
    ).toBe("completed");
  });

  it("reports overdue work as outstanding instead of advancing the week", () => {
    // Next week's menu was due Nov 8 and is still unapproved: it stays in review, flagged.
    const review = weekStatus(withPlan(base, "2026-11-16", "needs-review"), "2026-11-16", now);
    expect(review.status).toBe("needs-review");
    expect(review.outstanding.map((o) => o.kind)).toEqual(["menu"]);
    // The current week is being served without weekly sign-off: not "In Service".
    const serving = weekStatus(base, "2026-11-09", now);
    expect(serving.status).toBe("not-started");
    expect(serving.outstanding[0]?.message).toMatch(/Serving without an approved weekly menu/);
    // Approved menu but purchase approval past due (lead time 2 → due Sat Nov 14).
    const late = weekStatus(
      withPlan(base, "2026-11-16", "approved"),
      "2026-11-16",
      new Date(2026, 10, 15, 9),
    );
    expect(late.status).toBe("purchasing");
    expect(late.outstanding.map((o) => o.kind)).toEqual(["purchasing"]);
    // Within the deadline nothing is outstanding.
    expect(weekStatus(withPlan(base, "2026-11-23"), "2026-11-23", now).outstanding).toEqual([]);
  });

  it("never marks an unapproved past week Completed", () => {
    const past = weekStatus(withPlan(base, "2026-11-02", "needs-review"), "2026-11-02", now);
    expect(past.status).toBe("needs-review");
    expect(past.outstanding).toEqual([]);
    expect(past.note).toMatch(/without a weekly menu approval/);
  });
});

describe("weekly workstreams", () => {
  it("links the exact two open concerns and clears reviewed observations", () => {
    const base = initialState();
    const s: KitchenState = { ...base, observations: [
      { id: "follow-up-1", residentId: "R001", dishId: base.plan.breakfast, meal: "breakfast", serviceDate: "2026-11-11", notedAt: now.getTime(), reaction: "Reduced intake", severity: "concern", status: "open", demo: true },
      { id: "follow-up-2", residentId: "R002", dishId: base.plan.lunch, meal: "lunch", serviceDate: "2026-11-11", notedAt: now.getTime(), reaction: "Meal declined", severity: "concern", status: "open", demo: true },
    ] };
    const alert = weeklyWorkstreams(s, { proposals: [] }, now).service.alerts.find((a) => a.to === "/profile-updates");
    expect(alert?.observationIds).toBe("follow-up-1,follow-up-2");
    const reviewed = reducer(reducer(s, { type: "reviewObservation", id: "follow-up-1" }, now), { type: "reviewObservation", id: "follow-up-2" }, now);
    expect(weeklyWorkstreams(reviewed, { proposals: [] }, now).service.alerts.some((a) => a.to === "/profile-updates")).toBe(false);
  });
  it("summarizes the planning week from the same workflow the Agent Workspace runs", () => {
    let s: KitchenState = { ...initialState(), seeded: true };
    s = reducer(s, { type: "startWeeklyWorkflow", date: "2026-11-23" }, now);
    const running = weeklyWorkstreams(s, analyze(s, now), now).planning;
    expect(running.status).toBe("planning");
    expect(running.collaboration).toMatch(/^Step \d of 6/);

    const runId = latestRunFor(s, "week-2026-11-23")!.workflowRunId;
    for (let i = 0; i < WORKFLOW_STEPS; i++)
      s = reducer(
        s,
        { type: "advanceWeeklyWorkflow", runId },
        new Date(now.getTime() + (i + 1) * 60000),
      );
    const { planning, service, purchasing } = weeklyWorkstreams(s, analyze(s, now), now);
    expect(planning.startDate).toBe("2026-11-23");
    expect(planning.status).toBe(weekStatus(s, "2026-11-23", now).status);
    expect(planning.status).toBe("needs-review");
    expect(planning.mealsGenerated).toBe(21);
    expect(planning.collaboration).toMatch(/awaiting your decision/);
    expect(service.startDate).toBe("2026-11-09");
    expect(service.served).toBe(6);
    expect(service.today).toBe(3);
    expect(service.remaining).toBe(15);
    expect(purchasing.startDate).toBe("2026-11-16");
  });

  it("lists incoming orders that arrive before next week's service ends as expected deliveries", () => {
    const s: KitchenState = {
      ...initialState(),
      orders: [
        {
          id: "o1",
          vendor: "Green Valley",
          lines: [],
          deliveryDate: "2026-11-13",
          status: "incoming",
        },
        {
          id: "o2",
          vendor: "Harbor Foods",
          lines: [],
          deliveryDate: "2026-11-25",
          status: "incoming",
        },
        {
          id: "o3",
          vendor: "Green Valley",
          lines: [],
          deliveryDate: "2026-11-12",
          status: "received",
        },
      ],
    };
    const { deliveries } = weeklyWorkstreams(s, { proposals: [] }, now).purchasing;
    expect(deliveries).toEqual({ count: 1, next: "2026-11-13", vendors: ["Green Valley"] });
  });
});

describe("week navigation", () => {
  it("opens a calendar week in the Agent Workspace with that week selected", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const match = router.matchRoutes("/dashboard", { week: "2026-11-25" }).at(-1);
    expect(match?.routeId).toBe("/dashboard");
    expect(match?.search).toEqual({ week: "2026-11-23" });
    // Invalid dates are not normalized into a week (the page also ignores them).
    expect(router.matchRoutes("/dashboard", { week: "not-a-date" }).at(-1)?.routeId).toBe(
      "/dashboard",
    );
  });

  it("links the Agent Workspace week to the matching Approval Center week filter", () => {
    expect(approvalWeekFilter("2026-11-09", now)).toBe("current");
    expect(approvalWeekFilter("2026-11-18", now)).toBe("next");
    expect(approvalWeekFilter("2026-11-23", now)).toBe("two");
    // Weeks outside the rolling three deep-link by their Monday.
    expect(approvalWeekFilter("2026-12-03", now)).toBe("2026-11-30");
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes("/approvals", { week: "two" }).at(-1)?.search).toEqual({ week: "two" });
    expect(router.matchRoutes("/approvals", { week: "2026-12-03" }).at(-1)?.search).toEqual({ week: "2026-11-30" });
    // Invalid values are not normalized into a week (the page also ignores them).
    expect(router.matchRoutes("/approvals", { week: "someday" }).at(-1)?.routeId).toBe("/approvals");
    // The dashboard week to return to is normalized to its Monday.
    expect(router.matchRoutes("/approvals", { week: "two", fromDashboard: "2026-11-25" }).at(-1)?.search).toEqual({ week: "two", fromDashboard: "2026-11-23" });
  });
});
