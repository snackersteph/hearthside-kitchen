import { describe, expect, it } from "vitest";
import { initialState } from "@/lib/kitchen/data";
import { reducer } from "@/lib/kitchen/store";

describe("agent profile edits", () => {
  it("stores a staff-written summary for one agent only", () => {
    const next = reducer(initialState(), { type: "editAgentProfile", agent: "dietary", summary: "Watches every tray before it leaves the kitchen." });
    expect(next.agentEdits?.dietary?.summary).toBe("Watches every tray before it leaves the kitchen.");
    expect(next.agentEdits?.menu).toBeUndefined();
    expect(next.agentEdits?.dietary?.duties).toBeUndefined();
  });

  it("replaces the duty list instead of appending to it", () => {
    const first = reducer(initialState(), { type: "editAgentProfile", agent: "menu", duties: ["Plan breakfast", "Plan lunch"] });
    const second = reducer(first, { type: "editAgentProfile", agent: "menu", duties: ["Plan dinner only"] });
    expect(second.agentEdits?.menu?.duties).toEqual(["Plan dinner only"]);
  });

  it("keeps untouched configuration values when one is changed", () => {
    const first = reducer(initialState(), { type: "editAgentProfile", agent: "inventory", config: { "Forecast window": "14 days" } });
    const second = reducer(first, { type: "editAgentProfile", agent: "inventory", config: { "Delivery lead time": "4 days" } });
    expect(second.agentEdits?.inventory?.config).toEqual({ "Forecast window": "14 days", "Delivery lead time": "4 days" });
  });

  it("leaves the stored state untouched when no agent edit has been saved", () => {
    expect(initialState().agentEdits).toBeUndefined();
  });
});
