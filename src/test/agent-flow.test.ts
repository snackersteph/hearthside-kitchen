import { describe, expect, it } from "vitest";
import { DISHES, dishById, initialState } from "@/lib/kitchen/data";
import { resolveMenuState } from "@/lib/kitchen/engine";
import {
  answerFlow,
  canAnswer,
  FlowError,
  startFlow,
  type FlowOptionId,
  type FlowThread,
} from "@/lib/kitchen/agent-flow";
import type { RoomRole } from "@/lib/kitchen/agent-room-access";
import { dateKey, dayAt } from "@/lib/kitchen/schedule";
import { reducer, seedDemo } from "@/lib/kitchen/store";
import type { KitchenState, Meal } from "@/lib/kitchen/types";

const reference = new Date("2026-11-11T12:00:00");
const seeded = () => seedDemo(initialState(), reference);
const dateAt = (offset: number) => dateKey(dayAt(offset, reference));

/** Tomorrow's planned dish with one of its ingredients out of stock: it cannot arrive in time, so Menu must swap. */
function shortageScenario(meal: Meal) {
  const state = seeded();
  const planned = dishById(resolveMenuState(state, 1, reference).plan[meal]);
  const usage = (id: string) =>
    DISHES.filter((d) => d.meal === meal && d.ingredients.some((i) => i.id === id)).length;
  const scarce = [...planned.ingredients].sort((a, b) => usage(a.id) - usage(b.id))[0]!.id;
  return {
    state: {
      ...state,
      ingredients: state.ingredients.map((i) =>
        i.id === scarce ? { ...i, stock: 0, onOrder: 0 } : i,
      ),
    },
    planned,
    scarce,
  };
}

const start = (
  state: KitchenState,
  offset: number,
  meal: Meal,
  by: RoomRole = "chef",
  id = `t-${offset}-${meal}`,
) => startFlow(state, { id, date: dateAt(offset), meal, by, reference });
const reply = (
  state: KitchenState,
  thread: FlowThread,
  optionId: FlowOptionId,
  by: RoomRole = "chef",
) => answerFlow(state, thread, { questionId: thread.question!.id, optionId, by }, reference);
const apply = (state: KitchenState, effects: ReturnType<typeof answerFlow>["effects"]) =>
  effects.reduce((s, a) => reducer(s, a, reference), state);

/** A plan two days out that needs no swap and whose order needs Management. */
function managementPlan() {
  const state = seeded();
  for (const offset of [2, 3]) {
    for (const meal of ["breakfast", "lunch", "dinner"] as Meal[]) {
      const { thread } = start(state, offset, meal);
      if (thread.question?.kind === "approve" && thread.question.to === "management")
        return { state, thread, offset, meal };
    }
  }
  throw new Error("fixture: expected a plan that needs Management");
}

describe("flow: starting", () => {
  it("pauses with a question for the Chef when Inventory can't deliver in time", () => {
    const { state, planned, scarce } = shortageScenario("lunch");
    const { thread, effects } = start(state, 1, "lunch");
    expect(thread.status).toBe("awaiting");
    expect(effects).toEqual([]);
    expect(
      thread.events.some((e) => e.kind === "handoff" && e.from === "inventory" && e.to === "menu"),
    ).toBe(true);
    expect(thread.events.at(-1)).toMatchObject({
      from: "menu",
      to: "chef",
      kind: "approval-request",
    });
    expect(thread.question).toMatchObject({ kind: "propose", to: "chef", from: "menu" });
    expect(thread.question?.options.map((o) => o.id)).toEqual(["yes", "another", "stop"]);
    // It offers a different dish that doesn't use the missing ingredient, and remembers both.
    expect(thread.question!.dishId).not.toBe(planned.id);
    expect(dishById(thread.question!.dishId).ingredients.some((i) => i.id === scarce)).toBe(false);
    expect(thread.tried).toEqual([planned.id, thread.question!.dishId]);
  });

  it("goes straight to an approval question when nothing needs swapping", () => {
    const { thread } = managementPlan();
    expect(thread.question).toMatchObject({ kind: "approve", from: "menu" });
    expect(thread.plan?.ready).toBe(true);
    expect(thread.question?.to).toBe(thread.plan?.approver);
  });

  it("records who asked", () => {
    const { thread } = start(seeded(), 2, "dinner", "management");
    expect(thread.requestedBy).toBe("management");
    expect(thread.events[0]).toMatchObject({ from: "management", to: "menu", kind: "request" });
  });

  it("refuses caregivers and out-of-range days", () => {
    const state = seeded();
    expect(() => start(state, 2, "lunch", "caregiver")).toThrow(FlowError);
    try {
      start(state, 2, "lunch", "caregiver");
    } catch (e) {
      expect((e as FlowError).code).toBe("forbidden");
    }
    for (const offset of [0, 7]) {
      try {
        start(state, offset, "lunch");
        throw new Error("should have thrown");
      } catch (e) {
        expect((e as FlowError).code).toBe("invalid");
      }
    }
  });
});

describe("flow: answering", () => {
  it("re-checks with both other agents after a 'yes', then asks for approval", () => {
    const { state } = shortageScenario("lunch");
    const first = start(state, 1, "lunch").thread;
    const before = first.events.length;
    const { thread, effects } = reply(state, first, "yes");
    const added = thread.events.slice(before);
    expect(effects).toEqual([]);
    expect(added[0]).toMatchObject({ from: "chef", to: "menu", kind: "decision" });
    expect(added.some((e) => e.from === "menu" && e.text.startsWith("Switching to"))).toBe(true);
    expect(added.some((e) => e.from === "dietary" && e.text.startsWith("Re-checked"))).toBe(true);
    expect(added.some((e) => e.from === "inventory" && e.text.startsWith("Re-checked"))).toBe(true);
    expect(thread.status).toBe("awaiting");
    expect(thread.question).toMatchObject({ kind: "approve" });
    expect(thread.question?.id).not.toBe(first.question?.id);
  });

  it("offers a different dish each time it is asked for another option", () => {
    const { state } = shortageScenario("dinner");
    let thread = start(state, 1, "dinner").thread;
    const seen = new Set<string>(thread.tried);
    for (let i = 0; i < 3; i++) {
      thread = reply(state, thread, "another").thread;
      expect(thread.status).toBe("awaiting");
      expect(seen.has(thread.question!.dishId)).toBe(false);
      seen.add(thread.question!.dishId);
    }
  });

  it("stops without changing anything", () => {
    const { state } = shortageScenario("lunch");
    const first = start(state, 1, "lunch").thread;
    const { thread, effects } = reply(state, first, "stop");
    expect(thread.status).toBe("stopped");
    expect(thread.question).toBeUndefined();
    expect(effects).toEqual([]);
    expect(thread.events.at(-1)?.text).toMatch(/Nothing was changed/);
    // A finished conversation can't be answered any more.
    try {
      answerFlow(state, thread, { questionId: "anything", optionId: "yes", by: "chef" }, reference);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(FlowError);
      expect((e as FlowError).code).toBe("closed");
    }
  });

  it("only produces kitchen actions at the very end, and they really change the kitchen", () => {
    const { state } = shortageScenario("lunch");
    const asked = start(state, 1, "lunch");
    const swapped = reply(state, asked.thread, "yes");
    expect([asked.effects, swapped.effects]).toEqual([[], []]);
    const done = reply(state, swapped.thread, "yes");
    expect(done.thread.status).toBe("done");
    expect(done.effects.length).toBeGreaterThan(0);

    const after = apply(state, done.effects);
    const { date, meal, dishId } = {
      date: done.thread.date,
      meal: done.thread.meal,
      dishId: done.thread.plan!.dishId,
    };
    expect(after.scheduledPlans?.[date]?.[meal]).toBe(dishId);
    expect(after.mealApprovals?.[date]?.[meal]).toBeDefined();
    expect(done.thread.events.at(-1)?.text).toMatch(/Saved|Placed/);
  });

  it("places the orders when Management approves a big plan", () => {
    const { state, thread } = managementPlan();
    const done = reply(state, thread, "yes", "management");
    expect(done.thread.status).toBe("done");
    const after = apply(state, done.effects);
    expect((after.orders ?? []).length).toBe(
      (state.orders ?? []).length + done.thread.plan!.orders.length,
    );
    expect(
      done.thread.events.some((e) => e.from === "inventory" && e.text.startsWith("Placed")),
    ).toBe(true);
  });
});

describe("flow: who may answer", () => {
  it("keeps Management-only questions away from the Chef and Caregivers", () => {
    const { state, thread } = managementPlan();
    for (const role of ["chef", "caregiver"] as RoomRole[]) {
      try {
        reply(state, thread, "yes", role);
        throw new Error("should have been refused");
      } catch (e) {
        expect(e).toBeInstanceOf(FlowError);
        expect((e as FlowError).code).toBe("forbidden");
      }
    }
    expect(canAnswer("management", thread.question!).allowed).toBe(true);
  });

  it("lets Management answer a question addressed to the Chef, but never a Caregiver", () => {
    const { state } = shortageScenario("lunch");
    const { thread } = start(state, 1, "lunch");
    expect(canAnswer("chef", thread.question!).allowed).toBe(true);
    expect(canAnswer("management", thread.question!).allowed).toBe(true);
    expect(canAnswer("caregiver", thread.question!)).toMatchObject({ allowed: false });
    expect(
      reply(state, thread, "stop", "management").thread.events.some((e) => e.from === "management"),
    ).toBe(true);
  });

  it("rejects an answer to an old question or an unknown option", () => {
    const { state } = shortageScenario("lunch");
    const first = start(state, 1, "lunch").thread;
    const second = reply(state, first, "yes").thread;
    try {
      answerFlow(
        state,
        second,
        { questionId: first.question!.id, optionId: "yes", by: "chef" },
        reference,
      );
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as FlowError).code).toBe("stale");
    }
    try {
      answerFlow(
        state,
        second,
        { questionId: second.question!.id, optionId: "bogus" as FlowOptionId, by: "chef" },
        reference,
      );
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as FlowError).code).toBe("invalid");
    }
  });
});

describe("flow: it can be stored and resumed", () => {
  it("never changes the thread it was given", () => {
    const { state } = shortageScenario("lunch");
    const first = start(state, 1, "lunch").thread;
    const snapshot = JSON.stringify(first);
    reply(state, first, "yes");
    expect(JSON.stringify(first)).toBe(snapshot);
  });

  it("survives being saved as JSON between steps", () => {
    const { state } = shortageScenario("lunch");
    const saved = JSON.parse(JSON.stringify(start(state, 1, "lunch").thread)) as FlowThread;
    const resumed = reply(state, saved, "yes").thread;
    const savedAgain = JSON.parse(JSON.stringify(resumed)) as FlowThread;
    const done = reply(state, savedAgain, "yes");
    expect(done.thread.status).toBe("done");
    expect(new Set(done.thread.events.map((e) => e.id)).size).toBe(done.thread.events.length);
  });

  it("is deterministic", () => {
    const { state } = shortageScenario("lunch");
    expect(JSON.stringify(start(state, 1, "lunch"))).toBe(JSON.stringify(start(state, 1, "lunch")));
  });
});

describe("flow: the kitchen changes while someone is deciding", () => {
  it("re-checks instead of approving when stock or delivery times changed", () => {
    const { state, thread, offset, meal } = managementPlan();
    expect(thread.plan!.orders.length).toBeGreaterThan(0);
    // Deliveries now take a week, so the orders can no longer arrive in time.
    const later: KitchenState = { ...state, leadTimeDays: 7 };
    const { thread: next, effects } = reply(later, thread, "yes", "management");
    expect(effects).toEqual([]);
    expect(next.events.some((e) => /things changed/i.test(e.text))).toBe(true);
    expect(next.status === "awaiting" || next.status === "stopped").toBe(true);
    expect(next.plan?.orders.length ?? 0).toBe(0);
    void offset;
    void meal;
  });

  it("sends it to Management when prices rose past the Chef's limit while it waited", () => {
    const original = seeded();
    // Cheap prices at first, so the Chef can approve.
    const cheap: KitchenState = {
      ...original,
      ingredients: original.ingredients.map((i) => ({ ...i, unitCost: i.unitCost / 20 })),
    };
    let found: { thread: FlowThread } | undefined;
    for (const meal of ["breakfast", "lunch", "dinner"] as Meal[]) {
      const { thread } = start(cheap, 2, meal);
      if (
        thread.question?.kind === "approve" &&
        thread.question.to === "chef" &&
        thread.plan!.orders.length > 0
      ) {
        found = { thread };
        break;
      }
    }
    if (!found) throw new Error("fixture: expected a cheap plan with an order for the Chef");
    // Prices go back up before the Chef answers.
    const { thread, effects } = reply(original, found.thread, "yes", "chef");
    expect(effects).toEqual([]);
    expect(thread.status).toBe("awaiting");
    expect(thread.question).toMatchObject({ kind: "approve", to: "management" });
    expect(thread.events.some((e) => e.to === "management" && /over the \$200/.test(e.text))).toBe(
      true,
    );
  });
});
