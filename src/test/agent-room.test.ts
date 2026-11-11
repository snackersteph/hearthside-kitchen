import { describe, expect, it } from "vitest";
import { DISHES, dishById, initialState } from "@/lib/kitchen/data";
import { analyzeMenuDay, resolveMenuState } from "@/lib/kitchen/engine";
import {
  decisionEvents,
  escalationEvents,
  MANAGEMENT_APPROVAL_THRESHOLD,
  planActions,
  runAgentRoom,
  type RoomPlan,
  type RoomThread,
} from "@/lib/kitchen/agent-room";
import { can, ROOM_ROLES } from "@/lib/kitchen/agent-room-access";
import { dateKey, dayAt } from "@/lib/kitchen/schedule";
import { reducer, seedDemo } from "@/lib/kitchen/store";
import type { KitchenState, Meal } from "@/lib/kitchen/types";
import { vendorById } from "@/lib/kitchen/vendors";
import { vendorCompliance } from "@/lib/kitchen/vendor-engine";

const reference = new Date("2026-11-11T12:00:00");
const MEALS: Meal[] = ["breakfast", "lunch", "dinner"];
const seeded = () => seedDemo(initialState(), reference);
const dateAt = (offset: number) => dateKey(dayAt(offset, reference));

/** Every meal in the next three days, as the Chef might ask for them. */
const allThreads = (state: KitchenState) =>
  [1, 2, 3].flatMap((offset) =>
    MEALS.map((meal) => runAgentRoom(state, { date: dateAt(offset), meal, reference })),
  );

/**
 * Tomorrow's planned dish with one of its ingredients out of stock. Orders cannot arrive by tomorrow,
 * so the Inventory Agent has to hand the problem back to the Menu Agent.
 */
function shortageScenario(meal: Meal) {
  const state = seeded();
  const planned = dishById(resolveMenuState(state, 1, reference).plan[meal]);
  const usage = (id: string) =>
    DISHES.filter((d) => d.meal === meal && d.ingredients.some((i) => i.id === id)).length;
  // The ingredient fewest other dishes use, so there is always a dish left to swap to.
  const scarce = [...planned.ingredients].sort((a, b) => usage(a.id) - usage(b.id))[0]!.id;
  const next: KitchenState = {
    ...state,
    ingredients: state.ingredients.map((i) =>
      i.id === scarce ? { ...i, stock: 0, onOrder: 0 } : i,
    ),
  };
  return { state: next, planned, scarce };
}

describe("agent room: the conversation", () => {
  it("runs the agents in order and ends by asking the Chef to approve", () => {
    const t = runAgentRoom(seeded(), { date: dateAt(1), meal: "lunch", reference });
    expect(t.events[0]).toMatchObject({ from: "chef", to: "menu", kind: "request" });
    expect(t.events.at(-1)).toMatchObject({ from: "menu", to: "chef", kind: "approval-request" });
    const actors = t.events.map((e) => e.from);
    // Menu proposes, then Dietary checks, then Inventory checks, in that order.
    expect(actors.indexOf("menu")).toBeLessThan(actors.indexOf("dietary"));
    expect(actors.indexOf("dietary")).toBeLessThan(actors.indexOf("inventory"));
    expect(new Set(t.events.map((e) => e.id)).size).toBe(t.events.length);
  });

  it("is deterministic: the same request gives the same conversation", () => {
    const state = seeded();
    const a = runAgentRoom(state, { date: dateAt(2), meal: "dinner", reference });
    const b = runAgentRoom(state, { date: dateAt(2), meal: "dinner", reference });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("only accepts tomorrow up to six days ahead", () => {
    const state = seeded();
    expect(() => runAgentRoom(state, { date: dateAt(0), meal: "lunch", reference })).toThrow(
      RangeError,
    );
    expect(() => runAgentRoom(state, { date: dateAt(7), meal: "lunch", reference })).toThrow(
      RangeError,
    );
    expect(() => runAgentRoom(state, { date: dateAt(6), meal: "lunch", reference })).not.toThrow();
  });
});

describe("agent room: Inventory hands a shortage back to Menu", () => {
  it.each(MEALS)(
    "swaps the %s dish when an ingredient cannot arrive in time, and re-checks",
    (meal) => {
      const { state, planned, scarce } = shortageScenario(meal);
      const t = runAgentRoom(state, { date: dateAt(1), meal, reference });

      const handoff = t.events.find((e) => e.kind === "handoff");
      expect(handoff).toMatchObject({ from: "inventory", to: "menu", tone: "alert" });
      // Menu answers the handoff by proposing a swap, and both other agents re-check afterwards.
      const swapAt = t.events.findIndex((e) => e.from === "menu" && e.text.startsWith("Swapping"));
      expect(swapAt).toBeGreaterThan(t.events.indexOf(handoff!));
      const after = t.events.slice(swapAt + 1);
      expect(after.some((e) => e.from === "dietary" && e.text.startsWith("Re-checked"))).toBe(true);
      expect(after.some((e) => e.from === "inventory" && e.text.startsWith("Re-checked"))).toBe(
        true,
      );

      expect(t.plan.dishId).not.toBe(planned.id);
      expect(dishById(t.plan.dishId).ingredients.some((i) => i.id === scarce)).toBe(false);
      expect(t.plan.blocked).toEqual([]);
      expect(t.plan.ready).toBe(true);
      expect(t.tried).toEqual([planned.id, t.plan.dishId]);
    },
  );

  it("says so, and asks for a decision, when no dish avoids the shortage", () => {
    const { state } = shortageScenario("lunch");
    // Nothing at all can be bought in time for tomorrow, so no dish is orderable.
    const empty: KitchenState = {
      ...state,
      ingredients: state.ingredients.map((i) => ({ ...i, stock: 0, onOrder: 0 })),
    };
    const t = runAgentRoom(empty, { date: dateAt(1), meal: "lunch", reference });
    expect(t.plan.ready).toBe(false);
    expect(t.plan.blocked.length).toBeGreaterThan(0);
    expect(t.events.at(-1)).toMatchObject({ kind: "approval-request", tone: "alert" });
    expect(can("chef", "approve-plan", t.plan).allowed).toBe(false);
  });
});

describe("agent room: orders", () => {
  it("only orders from compliant vendors that arrive in time", () => {
    const threads = allThreads(seeded());
    const withOrders = threads.filter((t) => t.plan.orders.length > 0);
    expect(withOrders.length).toBeGreaterThan(0);
    for (const t of withOrders) {
      for (const order of t.plan.orders) {
        const vendor = vendorById(order.vendorId);
        expect(vendor, order.vendorId).toBeDefined();
        expect(order.deliveryDate <= t.date).toBe(true);
        for (const line of order.lines)
          expect(vendorCompliance(vendor!, line.ingredientId, reference).status).toBe("eligible");
      }
    }
  });

  it("totals each order and routes anything over the limit to Management", () => {
    for (const t of allThreads(seeded())) {
      expect(t.plan.orderTotal).toBeCloseTo(
        t.plan.orders.reduce((sum, o) => sum + o.total, 0),
        2,
      );
      expect(t.plan.approver).toBe(
        t.plan.orderTotal > MANAGEMENT_APPROVAL_THRESHOLD ? "management" : "chef",
      );
    }
  });

  it("tells staff about a cheaper vendor it refused", () => {
    const skipped = allThreads(seeded())
      .flatMap((t) => t.events)
      .find((e) => e.text.startsWith("Skipped "));
    expect(skipped).toMatchObject({ from: "inventory", tone: "alert" });
  });
});

describe("agent room: another option", () => {
  it("never proposes the same dish twice", () => {
    const state = seeded();
    let thread: RoomThread = runAgentRoom(state, { date: dateAt(2), meal: "dinner", reference });
    const seen = [thread.plan.dishId];
    for (let i = 0; i < 3; i++) {
      thread = runAgentRoom(state, {
        date: dateAt(2),
        meal: "dinner",
        reference,
        exclude: thread.tried,
      });
      expect(seen).not.toContain(thread.plan.dishId);
      seen.push(thread.plan.dishId);
      expect(thread.events[0]).toMatchObject({ from: "chef", kind: "request" });
    }
  });
});

describe("agent room: applying an approved plan", () => {
  it("saves the menu, signs it off and places the orders through the app's own actions", () => {
    const state = seeded();
    // A plan with an order, so the purchase path is covered too.
    const thread = allThreads(state).find(
      (t) => t.date === dateAt(2) && t.plan.orders.length > 0 && t.plan.ready,
    )!;
    expect(thread).toBeDefined();

    const after = planActions(thread.plan).reduce(
      (s, action) => reducer(s, action, reference),
      state,
    );

    expect(after.scheduledPlans?.[thread.date]?.[thread.plan.meal]).toBe(thread.plan.dishId);
    expect(after.mealApprovals?.[thread.date]?.[thread.plan.meal]).toBeDefined();
    expect(
      analyzeMenuDay(after, 2, reference).conflicts.filter((c) => c.meal === thread.plan.meal),
    ).toEqual([]);
    expect((after.orders ?? []).length).toBe(
      (state.orders ?? []).length + thread.plan.orders.length,
    );
    for (const order of thread.plan.orders)
      expect(
        after.orders?.some(
          (o) => o.vendor === order.vendorName && o.deliveryDate === order.deliveryDate,
        ),
      ).toBe(true);
  });

  it("writes the conversation lines for approval, rejection and escalation", () => {
    const thread = allThreads(seeded()).find((t) => t.plan.orders.length > 0)!;
    const approved = decisionEvents(thread, "approved");
    expect(approved.map((e) => e.from)).toEqual(["chef", "menu", "inventory"]);
    expect(decisionEvents(thread, "approved", "management")[0]?.from).toBe("management");
    expect(decisionEvents(thread, "rejected")).toHaveLength(1);
    const ids = [...thread.events, ...approved].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(escalationEvents(thread)[0]).toMatchObject({
      from: "chef",
      to: "management",
      kind: "approval-request",
    });
  });
});

describe("agent room: who may do what", () => {
  const plan = (over: Partial<RoomPlan>): RoomPlan => ({
    date: "2026-11-12",
    meal: "lunch",
    dishId: "x",
    dishName: "X",
    overrides: {},
    alternatives: [],
    unresolved: [],
    blocked: [],
    orders: [],
    orderTotal: 0,
    approver: "chef",
    ready: true,
    ...over,
  });

  it("lets caregivers follow along but not ask for or approve anything", () => {
    expect(can("caregiver", "view").allowed).toBe(true);
    expect(can("caregiver", "request-plan").allowed).toBe(false);
    expect(can("caregiver", "approve-plan", plan({})).allowed).toBe(false);
    expect(can("caregiver", "request-plan").reason).toMatch(/can't ask/);
  });

  it("lets the Chef approve within the limit but not above it", () => {
    expect(can("chef", "approve-plan", plan({ approver: "chef" })).allowed).toBe(true);
    const over = can("chef", "approve-plan", plan({ approver: "management", orderTotal: 300 }));
    expect(over.allowed).toBe(false);
    expect(over.reason).toContain(String(MANAGEMENT_APPROVAL_THRESHOLD));
    expect(
      can("chef", "send-to-management", plan({ approver: "management", orderTotal: 300 })).allowed,
    ).toBe(true);
  });

  it("lets Management approve any amount, but not send to itself", () => {
    expect(
      can("management", "approve-plan", plan({ approver: "management", orderTotal: 900 })).allowed,
    ).toBe(true);
    expect(can("management", "send-to-management", plan({ approver: "management" })).allowed).toBe(
      false,
    );
  });

  it("never lets anyone approve a plan that still has unresolved items", () => {
    for (const role of ROOM_ROLES)
      expect(can(role, "approve-plan", plan({ ready: false })).allowed).toBe(false);
    expect(
      can("chef", "send-to-management", plan({ ready: false, approver: "management" })).allowed,
    ).toBe(false);
  });

  it("only offers 'send to Management' when the plan needs it", () => {
    expect(can("chef", "send-to-management", plan({ approver: "chef" })).allowed).toBe(false);
  });
});
