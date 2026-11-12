import { describe, expect, it } from "vitest";
import { pendingPurchasingWeeks } from "@/lib/kitchen/purchasing-review";
import type { WeeklyPurchasePlan } from "@/lib/kitchen/weekly-purchasing";

function plan(startDate: string, state: WeeklyPurchasePlan["state"] = "needs-review", invalidated = false): WeeklyPurchasePlan {
  return { weekId: `week-${startDate}`, startDate, endDate: startDate, state, invalidated, rows: [], proposals: [{ id: startDate, kind: "purchase", agent: "inventory", vendor: "Test vendor", lines: [], total: 10, serviceWeekId: `week-${startDate}` }], rejected: [], orders: [], total: 10, flags: [] };
}
describe("next week purchasing review", () => {
  it("includes only pending orders for November 16 and excludes past and later weeks", () => {
    const next = plan("2026-11-16");
    expect(pendingPurchasingWeeks([plan("2026-11-09"), next, plan("2026-11-23")], "2026-11-16")).toEqual([next]);
  });
  it("excludes approved, withdrawn and fully decided requests", () => {
    expect(pendingPurchasingWeeks([plan("2026-11-16", "approved"), plan("2026-11-16", "needs-review", true), plan("2026-11-16", "ready-to-confirm"), { ...plan("2026-11-16"), proposals: [] }], "2026-11-16")).toEqual([]);
  });
});