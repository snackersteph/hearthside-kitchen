import { describe, expect, it } from "vitest";
import { initialState } from "@/lib/kitchen/data";
import { emergencyMenuDemo, EMERGENCY_MENU_DEMO } from "@/lib/kitchen/emergency-menu-demo";
import { reducer } from "@/lib/kitchen/store";

describe("showcase emergency menu", () => {
  const reference = new Date("2026-11-12T12:00:00");
  it("shows the emergency in the current November 9–15 service week only", () => {
    const state = initialState();
    expect(emergencyMenuDemo(state, reference)?.week).toBe("2026-11-09");
    expect(emergencyMenuDemo(state, new Date("2026-11-16T12:00:00"))).toBeNull();
  });
  it("saves approval once without changing actual care records or menus", () => {
    const state = initialState();
    const action = { type: "approveEmergencyMenuDemo" as const, id: EMERGENCY_MENU_DEMO.id };
    const next = reducer(state, action, reference);
    expect(emergencyMenuDemo(next, reference)?.approvedAt).toBe(reference.getTime());
    expect(next.residents).toEqual(state.residents);
    expect(next.scheduledOverrides).toEqual(state.scheduledOverrides);
    expect(next.plan).toEqual(state.plan);
    expect(reducer(next, action, new Date("2026-11-13T12:00:00")).emergencyDemoApprovals).toEqual(next.emergencyDemoApprovals);
  });
  it("rejects unknown and out-of-week requests", () => {
    const state = initialState();
    expect(reducer(state, { type: "approveEmergencyMenuDemo", id: "unknown" }, reference).emergencyDemoApprovals).toBeUndefined();
    expect(reducer(state, { type: "approveEmergencyMenuDemo", id: EMERGENCY_MENU_DEMO.id }, new Date("2026-11-16T12:00:00")).emergencyDemoApprovals).toBeUndefined();
  });
});