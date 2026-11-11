import { describe, expect, it } from "vitest";
import { initialState } from "@/lib/kitchen/data";
import { reducer } from "@/lib/kitchen/store";
import type { KitchenState } from "@/lib/kitchen/types";
import {
  addDays, approvalTiming, isPastDue, lifecycleDates, migrateWeeklyPlans, parseDateKey, phaseFor, weekStartFor, type WeeklyPlan,
} from "@/lib/kitchen/weekly-schedule";

// Wednesday Nov 11, 2026, mid-morning local time.
const now = new Date(2026, 10, 11, 9, 30);
const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h);
const plans = (s: KitchenState) => s.weeklyPlans ?? [];
const create = (s: KitchenState, date: string, ref = now) => reducer(s, { type: "createWeeklyPlan", date }, ref);

describe("weekly schedule date maths", () => {
  it("snaps any day of the week to its Monday", () => {
    expect(weekStartFor("2026-11-23")).toBe("2026-11-23");
    expect(weekStartFor("2026-11-26")).toBe("2026-11-23");
    expect(weekStartFor("2026-11-29")).toBe("2026-11-23"); // Sunday belongs to the previous Monday
    expect(weekStartFor("2027-01-01")).toBe("2026-12-28"); // across a year boundary
  });

  it("adds calendar days across month, year and DST boundaries without drifting", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-28", 6)).toBe("2027-01-03");
    expect(addDays("2026-10-26", 7)).toBe("2026-11-02"); // US DST ends Nov 1, 2026
    expect(addDays("2026-03-02", 7)).toBe("2026-03-09"); // US DST starts Mar 8, 2026
    expect(addDays("2026-03-30", -14)).toBe("2026-03-16"); // EU DST starts Mar 29, 2026
  });

  it("rejects impossible or malformed date keys", () => {
    expect(parseDateKey("2026-02-30")).toBeNull();
    expect(parseDateKey("2026-11-1")).toBeNull();
    expect(parseDateKey("2026-11-11T00:00:00Z")).toBeNull();
  });

  it("calculates planning and purchasing target dates relative to the service week", () => {
    expect(lifecycleDates("2026-11-23", 2)).toEqual({
      planningStart: "2026-11-09", planningEnd: "2026-11-15", menuDueDate: "2026-11-15",
      purchasingStart: "2026-11-16", purchasingEnd: "2026-11-22", purchasingDueDate: "2026-11-20",
      serviceStart: "2026-11-23", serviceEnd: "2026-11-29",
    });
  });

  it("moves the purchasing deadline earlier for longer lead times, never before purchasing opens", () => {
    expect(lifecycleDates("2026-11-23", 0).purchasingDueDate).toBe("2026-11-22");
    expect(lifecycleDates("2026-11-23", 5).purchasingDueDate).toBe("2026-11-17");
    expect(lifecycleDates("2026-11-23", 14).purchasingDueDate).toBe("2026-11-16");
  });

  it("derives the phase from the calendar", () => {
    const start = "2026-11-23";
    expect(phaseFor(start, "2026-11-08")).toBe("upcoming");
    expect(phaseFor(start, "2026-11-09")).toBe("planning");
    expect(phaseFor(start, "2026-11-15")).toBe("planning");
    expect(phaseFor(start, "2026-11-16")).toBe("purchasing");
    expect(phaseFor(start, "2026-11-22")).toBe("purchasing");
    expect(phaseFor(start, "2026-11-23")).toBe("service");
    expect(phaseFor(start, "2026-11-29")).toBe("service");
    expect(phaseFor(start, "2026-11-30")).toBe("completed");
    // Late on a local Sunday is still Sunday, not Monday in UTC.
    expect(phaseFor(start, new Date(2026, 10, 22, 23, 59))).toBe("purchasing");
  });

  it("treats a deadline as passed only after the whole due date", () => {
    expect(isPastDue("2026-11-15", "2026-11-15")).toBe(false);
    expect(isPastDue("2026-11-15", "2026-11-16")).toBe(true);
  });
});

describe("weekly plan reducer actions", () => {
  it("creates and saves a Monday–Sunday service week from any date in it", () => {
    const s = create(initialState(), "2026-11-25");
    expect(plans(s)).toEqual([{
      id: "week-2026-11-23", startDate: "2026-11-23", endDate: "2026-11-29", phase: "planning",
      menuStatus: "not-started", purchasingStatus: "not-started", menuApprovedAt: null, purchasingApprovedAt: null,
      createdAt: now.getTime(), updatedAt: now.getTime(),
    }]);
    const restored = migrateWeeklyPlans(JSON.parse(JSON.stringify(s)) as KitchenState, now);
    expect(plans(restored)).toEqual(plans(s));
  });

  it("ignores duplicate weeks and invalid dates", () => {
    const s = create(initialState(), "2026-11-23");
    expect(create(s, "2026-11-29")).toBe(s);
    expect(create(s, "not-a-date")).toBe(s);
    expect(create(s, "2026-02-30")).toBe(s);
  });

  it("keeps multiple weeks independent", () => {
    let s = initialState();
    for (const date of ["2026-11-23", "2026-11-09", "2026-11-16"]) s = create(s, date);
    expect(plans(s).map((p) => [p.id, p.phase])).toEqual([["week-2026-11-09", "service"], ["week-2026-11-16", "purchasing"], ["week-2026-11-23", "planning"]]);
    const approvedAt = at(2026, 11, 12);
    s = reducer(s, { type: "updateWeeklyPlanStatus", id: "week-2026-11-23", menuStatus: "approved" }, approvedAt);
    expect(plans(s).find((p) => p.id === "week-2026-11-23")).toMatchObject({ menuStatus: "approved", menuApprovedAt: approvedAt.getTime() });
    for (const other of plans(s).filter((p) => p.id !== "week-2026-11-23")) expect(other).toMatchObject({ menuStatus: "not-started", menuApprovedAt: null, updatedAt: now.getTime() });
  });

  it("stamps and clears approval times and enforces menu-before-purchasing", () => {
    let s = create(initialState(), "2026-11-23");
    const id = "week-2026-11-23";
    const blocked = reducer(s, { type: "updateWeeklyPlanStatus", id, purchasingStatus: "approved" }, now);
    expect(blocked).toBe(s);
    s = reducer(s, { type: "updateWeeklyPlanStatus", id, menuStatus: "approved" }, at(2026, 11, 13));
    s = reducer(s, { type: "updateWeeklyPlanStatus", id, purchasingStatus: "approved" }, at(2026, 11, 17));
    expect(plans(s)[0]).toMatchObject({ menuApprovedAt: at(2026, 11, 13).getTime(), purchasingApprovedAt: at(2026, 11, 17).getTime() });
    // Re-sending "approved" keeps the original timestamp.
    expect(reducer(s, { type: "updateWeeklyPlanStatus", id, menuStatus: "approved" }, at(2026, 11, 18))).toBe(s);
    // Reopening the menu sends approved purchasing back to review.
    s = reducer(s, { type: "updateWeeklyPlanStatus", id, menuStatus: "needs-review" }, at(2026, 11, 18));
    expect(plans(s)[0]).toMatchObject({ menuStatus: "needs-review", menuApprovedAt: null, purchasingStatus: "needs-review", purchasingApprovedAt: null, updatedAt: at(2026, 11, 18).getTime() });
  });

  it("never approves anything because a deadline passed, and flags late approvals", () => {
    let s = create(initialState(), "2026-11-16");
    // Long after every deadline, statuses are still what staff left them as.
    s = migrateWeeklyPlans(s, at(2026, 12, 1));
    expect(plans(s)[0]).toMatchObject({ phase: "completed", menuStatus: "not-started", purchasingStatus: "not-started" });
    // Approving after the menu deadline (Nov 8) is allowed but recorded as late.
    s = reducer(s, { type: "updateWeeklyPlanStatus", id: "week-2026-11-16", menuStatus: "approved" }, now);
    expect(approvalTiming(plans(s)[0] as WeeklyPlan)).toEqual({ menuApprovedLate: true, purchasingApprovedLate: false });
  });

  it("selects only existing service weeks", () => {
    const s = create(initialState(), "2026-11-23");
    expect(reducer(s, { type: "selectServiceWeek", id: "week-2030-01-07" })).toBe(s);
    const selected = reducer(s, { type: "selectServiceWeek", id: "week-2026-11-23" });
    expect(selected.selectedWeekId).toBe("week-2026-11-23");
    expect("selectedWeekId" in reducer(selected, { type: "selectServiceWeek", id: null })).toBe(false);
  });

  it("does not touch daily menus, approvals, residents, inventory or orders", () => {
    const base = { ...initialState(), scheduledPlans: { "2026-11-24": { lunch: "l-alfredo" } }, mealApprovals: { "2026-11-24": { lunch: { signature: "x", approvedAt: 1 } } } };
    let s = create(base, "2026-11-23");
    s = reducer(s, { type: "updateWeeklyPlanStatus", id: "week-2026-11-23", menuStatus: "approved" }, now);
    const { weeklyPlans: _w, ...rest } = s;
    expect(rest).toEqual(base);
  });
});

describe("weekly plan migration", () => {
  it("adds an empty list to older saves and preserves every existing record", () => {
    const saved = JSON.parse(JSON.stringify({ ...initialState(), scheduledPlans: { "2026-11-24": { lunch: "l-alfredo" } }, orders: [{ id: "o1", vendor: "Sysco", lines: [], deliveryDate: "2026-11-20", status: "incoming" }] })) as KitchenState;
    const migrated = migrateWeeklyPlans(saved, now);
    expect(migrated.weeklyPlans).toEqual([]);
    const { weeklyPlans: _w, ...rest } = migrated;
    expect(rest).toEqual(saved);
    expect(migrateWeeklyPlans(migrated, now)).toEqual(migrated);
  });

  it("repairs malformed records and drops ones without a usable week", () => {
    const saved = { ...initialState(), selectedWeekId: "week-1999-01-04", weeklyPlans: [
      { startDate: "2026-11-25", menuStatus: "bogus", purchasingStatus: "approved", createdAt: 5 },
      { startDate: "2026-11-23", menuStatus: "approved" },
      { startDate: "nope" },
      null,
    ] } as unknown as KitchenState;
    const migrated = migrateWeeklyPlans(saved, now);
    expect(plans(migrated)).toEqual([{
      id: "week-2026-11-23", startDate: "2026-11-23", endDate: "2026-11-29", phase: "planning",
      menuStatus: "not-started", purchasingStatus: "needs-review", menuApprovedAt: null, purchasingApprovedAt: null,
      createdAt: 5, updatedAt: 5,
    }]);
    expect("selectedWeekId" in migrated).toBe(false);
  });
});
