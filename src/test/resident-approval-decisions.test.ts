import { describe, expect, it } from "vitest";
import { initialState } from "@/lib/kitchen/data";
import { analyzeMenuDay } from "@/lib/kitchen/engine";
import { reducer } from "@/lib/kitchen/store";

describe("resident alternative decisions", () => {
  const reference = new Date("2026-11-10T12:00:00");
  function setup() {
    const state = initialState();
    const proposal = analyzeMenuDay(state, 1, reference).proposals.find((p) => p.kind === "substitution" && p.residentIds.length > 1);
    if (!proposal || proposal.kind !== "substitution") throw new Error("Missing grouped suggestion");
    return { state, proposal, id: proposal.residentIds[0] ?? "" };
  }
  it("approves only the selected resident", () => {
    const { state, proposal: p, id } = setup();
    const next = reducer(state, { type: "approveSub", proposalId: p.id, meal: p.meal, dishId: p.dishId, residentIds: [id], serviceDate: p.serviceDate, modified: false, summary: "Individual approval" }, reference);
    expect(next.scheduledOverrides?.["2026-11-11"]?.[p.meal]).toEqual({ [id]: p.dishId });
    expect(analyzeMenuDay(next, 1, reference).proposals.some((q) => q.kind === "substitution" && q.meal === p.meal && q.residentIds.includes(p.residentIds[1] ?? ""))).toBe(true);
  });
  it("rejects only the selected resident, persists after regrouping and does not affect another date", () => {
    const { state, proposal: p, id } = setup();
    const next = reducer(state, { type: "rejectSub", proposalId: p.id, meal: p.meal, fromDishId: p.fromDishId, dishId: p.dishId, residentIds: [id], serviceDate: p.serviceDate, summary: "Individual rejection" }, reference);
    const day = analyzeMenuDay(next, 1, reference);
    expect(day.conflicts.find((c) => c.meal === p.meal && c.residentId === id)?.status).toBe("needs-staff");
    expect(day.proposals.some((q) => q.kind === "substitution" && q.meal === p.meal && q.residentIds.includes(id))).toBe(false);
    expect(day.proposals.some((q) => q.kind === "substitution" && q.meal === p.meal && q.residentIds.includes(p.residentIds[1] ?? ""))).toBe(true);
    expect(analyzeMenuDay(next, 2, reference).proposals).toEqual(analyzeMenuDay(state, 2, reference).proposals);
  });
  it("reject all records every suggested resident without approving the main dish", () => {
    const { state, proposal: p } = setup();
    const next = reducer(state, { type: "rejectSub", proposalId: p.id, meal: p.meal, fromDishId: p.fromDishId, dishId: p.dishId, residentIds: p.residentIds, serviceDate: p.serviceDate, summary: "Reject all" }, reference);
    const day = analyzeMenuDay(next, 1, reference);
    for (const id of p.residentIds) expect(day.conflicts.find((c) => c.meal === p.meal && c.residentId === id)?.status).toBe("needs-staff");
    expect(next.mealApprovals?.["2026-11-11"]?.[p.meal]).toBeUndefined();
  });
  it("approve all applies the alternative to every suggested resident", () => {
    const { state, proposal: p } = setup();
    const next = reducer(state, { type: "approveSub", proposalId: p.id, meal: p.meal, dishId: p.dishId, residentIds: p.residentIds, serviceDate: p.serviceDate, modified: false, summary: "Approve all" }, reference);
    expect(next.scheduledOverrides?.["2026-11-11"]?.[p.meal]).toEqual(Object.fromEntries(p.residentIds.map((id) => [id, p.dishId])));
  });
});