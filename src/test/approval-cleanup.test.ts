import { describe, expect, it } from "vitest";
import { initialState } from "@/lib/kitchen/data";
import { migrateApprovalCleanup } from "@/lib/kitchen/approval-cleanup";
import type { Decision } from "@/lib/kitchen/types";

function decision(id: string, date: string, serviceDate?: string): Decision {
  return { proposalId: id, kind: serviceDate ? "substitution" : "purchase", at: new Date(`${date}T12:00:00`).getTime(), ...(serviceDate ? { serviceDate } : {}), status: "approved", summary: id, modified: false };
}

describe("November 1 approval cleanup", () => {
  it("removes meal requests before November 1 by service date, retaining the cutoff and newer dates", () => {
    const state = { ...initialState(), history: [decision("old", "2026-11-02", "2026-10-31"), decision("cutoff", "2026-10-31", "2026-11-01"), decision("new", "2026-11-02", "2026-11-02")] };
    expect(migrateApprovalCleanup(state).history.map((d) => d.proposalId)).toEqual(["cutoff", "new"]);
  });

  it("removes undated purchase requests by their recorded date, keeping November 1 and newer", () => {
    const state = { ...initialState(), history: [decision("old", "2026-10-31"), decision("cutoff", "2026-11-01"), decision("new", "2026-11-02")] };
    expect(migrateApprovalCleanup(state).history.map((d) => d.proposalId)).toEqual(["cutoff", "new"]);
  });

  it("preserves operational records and does not rerun after the cleanup is saved", () => {
    const state = initialState();
    const cleaned = migrateApprovalCleanup(state);
    expect(cleaned.ingredients).toBe(state.ingredients);
    expect(cleaned.orders).toBe(state.orders);
    expect(cleaned.residents).toBe(state.residents);
    expect(cleaned.scheduledOverrides).toBe(state.scheduledOverrides);
    expect(cleaned.mealApprovals).toBe(state.mealApprovals);
    expect(migrateApprovalCleanup(cleaned)).toBe(cleaned);
  });
});