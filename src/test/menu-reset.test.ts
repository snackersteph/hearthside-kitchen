import { describe, expect, it } from "vitest";
import { initialState } from "@/lib/kitchen/data";
import { isMenuCleared, migrateMenuReset } from "@/lib/kitchen/menu-reset";

describe("January 2027 menu reset", () => {
  it("removes every proposed meal, override and approval for January 2027 only", () => {
    const base = {
      ...initialState(),
      scheduledPlans: { "2027-01-05": { lunch: "l-lentil" }, "2027-02-02": { lunch: "l-club" } },
      scheduledOverrides: { "2027-01-05": { lunch: { R001: "l-puree" } }, "2026-12-30": { lunch: { R002: "l-puree" } } },
      mealApprovals: { "2027-01-05": { lunch: { signature: "s", approvedAt: 1 } } },
      mealRejections: { "2027-01-06": { dinner: { signature: "s", rejectedAt: 1 } } },
    };
    const state = migrateMenuReset(base);
    expect(state.scheduledPlans).toEqual({ "2027-02-02": { lunch: "l-club" } });
    expect(state.scheduledOverrides).toEqual({ "2026-12-30": { lunch: { R002: "l-puree" } } });
    expect(state.mealApprovals).toEqual({});
    expect(state.mealRejections).toEqual({});
    expect(state.clearedMonths).toContain("2027-01");
  });

  it("marks January 2027 dates as not started and runs only once", () => {
    const state = migrateMenuReset(initialState());
    expect(isMenuCleared(state, "2027-01-15")).toBe(true);
    expect(isMenuCleared(state, "2027-02-01")).toBe(false);
    expect(isMenuCleared(state, "2026-12-31")).toBe(false);
    expect(migrateMenuReset(state)).toBe(state);
  });
});
