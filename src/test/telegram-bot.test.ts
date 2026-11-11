import { describe, expect, it } from "vitest";
import { DISHES, dishById, initialState } from "@/lib/kitchen/data";
import { resolveMenuState } from "@/lib/kitchen/engine";
import {
  answerData,
  handleUpdate,
  memoryStores,
  parsePlanRequest,
  renderEvent,
  type Outbound,
  type TelegramUpdate,
} from "@/lib/kitchen/telegram-bot";
import type { RoomRole } from "@/lib/kitchen/agent-room-access";
import { seedDemo } from "@/lib/kitchen/store";
import type { KitchenState, Meal } from "@/lib/kitchen/types";

const reference = new Date("2026-11-11T12:00:00"); // a Wednesday
const CHEF = 1;
const MGMT = 2;
const CARE = 3;
const NAMES: Record<number, string> = { [CHEF]: "Chris", [MGMT]: "Morgan", [CARE]: "Casey" };
const invites: Record<string, RoomRole> = {
  "CHEF-1": "chef",
  "MGMT-1": "management",
  "CARE-1": "caregiver",
};

const seeded = () => seedDemo(initialState(), reference);
let uid = 0;
const msg = (from: number, text: string): TelegramUpdate => ({
  update_id: ++uid,
  message: {
    message_id: uid,
    chat: { id: from },
    from: { id: from, first_name: NAMES[from] ?? "Someone" },
    text,
  },
});
const tap = (from: number, data: string, text = "Earlier message"): TelegramUpdate => ({
  update_id: ++uid,
  callback_query: {
    id: `cb${uid}`,
    from: { id: from, first_name: NAMES[from] ?? "Someone" },
    message: { message_id: 99, chat: { id: from }, text },
    data,
  },
});

const setup = async (state: KitchenState = seeded()) => {
  const stores = memoryStores(state, invites, () => reference);
  await handleUpdate(msg(CHEF, "/start CHEF-1"), stores);
  await handleUpdate(msg(MGMT, "/start MGMT-1"), stores);
  await handleUpdate(msg(CARE, "/start CARE-1"), stores);
  return stores;
};
const sends = (out: Outbound[]) =>
  out.filter((o): o is Extract<Outbound, { kind: "send" }> => o.kind === "send");
const to = (out: Outbound[], chat: number) => sends(out).find((o) => o.chatId === chat);
const buttonData = (out: Outbound[], chat: number) =>
  (to(out, chat)?.buttons?.[0] ?? []).map((b) => b.data);
const dataFor = (out: Outbound[], chat: number, label: RegExp) =>
  to(out, chat)?.buttons?.[0]?.find((b) => label.test(b.text))?.data;

/** Tomorrow's planned dish with one ingredient out of stock, so the agents must propose a swap. */
function shortageKitchen(meal: Meal): KitchenState {
  const state = seeded();
  const planned = dishById(resolveMenuState(state, 1, reference).plan[meal]);
  const usage = (id: string) =>
    DISHES.filter((d) => d.meal === meal && d.ingredients.some((i) => i.id === id)).length;
  const scarce = [...planned.ingredients].sort((a, b) => usage(a.id) - usage(b.id))[0]!.id;
  return {
    ...state,
    ingredients: state.ingredients.map((i) =>
      i.id === scarce ? { ...i, stock: 0, onOrder: 0 } : i,
    ),
  };
}

describe("telegram: joining", () => {
  it("links a person to a role with an invite code", async () => {
    const stores = memoryStores(seeded(), invites, () => reference);
    const out = await handleUpdate(msg(CHEF, "/start CHEF-1"), stores);
    expect(sends(out)[0]?.text).toMatch(/Your role: Chef/);
    expect((await stores.users.get(CHEF))?.role).toBe("chef");
    expect((await handleUpdate(msg(CHEF, "/whoami"), stores)).length).toBe(1);
  });

  it("refuses an unknown invite code and asks strangers to link first", async () => {
    const stores = memoryStores(seeded(), invites, () => reference);
    expect(sends(await handleUpdate(msg(CHEF, "/start NOPE"), stores))[0]?.text).toMatch(
      /isn't valid/,
    );
    expect(await stores.users.get(CHEF)).toBeUndefined();
    expect(sends(await handleUpdate(msg(CHEF, "/plan lunch tomorrow"), stores))[0]?.text).toMatch(
      /link your account first/i,
    );
    expect(await stores.threads.get("t1")).toBeUndefined();
  });
});

describe("telegram: understanding a request", () => {
  const at = (n: number) => parsePlanRequest(`plan lunch in ${n} days`, reference);
  it("reads the meal and day, defaulting to tomorrow", () => {
    expect(parsePlanRequest("/plan lunch tomorrow", reference)).toEqual({
      ok: true,
      date: "2026-11-12",
      meal: "lunch",
    });
    expect(parsePlanRequest("dinner", reference)).toEqual({
      ok: true,
      date: "2026-11-12",
      meal: "dinner",
    });
    expect(parsePlanRequest("/plan dinner fri", reference)).toEqual({
      ok: true,
      date: "2026-11-13",
      meal: "dinner",
    });
    expect(parsePlanRequest("breakfast in 3 days", reference)).toEqual({
      ok: true,
      date: "2026-11-14",
      meal: "breakfast",
    });
    expect(parsePlanRequest("plan lunch on 2026-11-15", reference)).toEqual({
      ok: true,
      date: "2026-11-15",
      meal: "lunch",
    });
  });
  it("asks which meal when it is missing, and refuses days outside the window", () => {
    expect(parsePlanRequest("/plan tomorrow", reference)).toEqual({
      ok: false,
      reason: "no-meal",
      date: "2026-11-12",
    });
    expect(parsePlanRequest("lunch today", reference)).toMatchObject({
      ok: false,
      reason: "bad-day",
    });
    expect(at(7)).toMatchObject({ ok: false, reason: "bad-day" });
    expect(at(6)).toMatchObject({ ok: true });
  });
});

describe("telegram: asking and the shared room", () => {
  it("asks a follow-up question when the meal is missing, and carries on after the tap", async () => {
    const stores = await setup();
    const asked = await handleUpdate(msg(CHEF, "/plan tomorrow"), stores);
    expect(sends(asked)).toHaveLength(1);
    expect(to(asked, CHEF)?.text).toMatch(/Which meal for Thu, Nov 12\?/);
    const mealButtons = to(asked, CHEF)!.buttons![0]!;
    expect(mealButtons.map((b) => b.text)).toEqual(["Breakfast", "Lunch", "Dinner"]);

    const out = await handleUpdate(tap(CHEF, mealButtons[1]!.data, "Which meal?"), stores);
    expect(out[0]).toMatchObject({ kind: "answer" });
    // the picker stops looking tappable once a meal is chosen
    expect(out.find((o) => o.kind === "edit")).toMatchObject({
      chatId: CHEF,
      text: "Which meal?\n\n✔ Chris chose: Lunch",
    });
    expect(to(out, CHEF)?.text).toContain("Please plan lunch for Thu, Nov 12");
  });

  it("shows everyone the conversation but gives buttons only to people who may answer", async () => {
    const stores = await setup();
    // Two days out the order is over the Chef's limit, so only Management may approve.
    const out = await handleUpdate(msg(CHEF, "/plan dinner in 2 days"), stores);
    expect(
      sends(out)
        .map((o) => o.chatId)
        .sort(),
    ).toEqual([CHEF, MGMT, CARE]);
    expect(buttonData(out, MGMT).length).toBe(3);
    expect(buttonData(out, CHEF)).toEqual([]);
    expect(buttonData(out, CARE)).toEqual([]);
    expect(to(out, CHEF)?.text).toMatch(/Waiting for Management/);
    expect(to(out, MGMT)?.text).toMatch(/Management must approve/);
  });

  it("won't let a caregiver start anything", async () => {
    const stores = await setup();
    const out = await handleUpdate(msg(CARE, "/plan lunch tomorrow"), stores);
    expect(sends(out)).toHaveLength(1);
    expect(to(out, CARE)?.text).toMatch(/can't ask for plans/);
    expect(stores.peek.thread("t1")).toBeUndefined();
  });
});

describe("telegram: answering with buttons", () => {
  it("lets Management approve, then places the order and tells everyone", async () => {
    const stores = await setup();
    const before = (stores.peek.kitchen().orders ?? []).length;
    const asked = await handleUpdate(msg(CHEF, "/plan dinner in 2 days"), stores);
    const approve = dataFor(asked, MGMT, /approve/i)!;

    const out = await handleUpdate(tap(MGMT, approve, to(asked, MGMT)!.text), stores);
    expect(out.find((o) => o.kind === "edit")).toMatchObject({
      chatId: MGMT,
      text: expect.stringContaining("✔ Morgan (Management) chose: Approve"),
    });
    expect(
      sends(out)
        .map((o) => o.chatId)
        .sort(),
    ).toEqual([CHEF, MGMT, CARE]);
    expect(to(out, CHEF)?.text).toMatch(/Approved|Saved|Placed/);
    expect(stores.peek.thread("t1")?.status).toBe("done");
    expect((stores.peek.kitchen().orders ?? []).length).toBeGreaterThan(before);
    expect(stores.peek.kitchen().mealApprovals?.["2026-11-13"]?.dinner).toBeDefined();
  });

  it("refuses the Chef's tap on a Management question, and changes nothing", async () => {
    const stores = await setup();
    const asked = await handleUpdate(msg(CHEF, "/plan dinner in 2 days"), stores);
    const approve = dataFor(asked, MGMT, /approve/i)!;
    const kitchenBefore = JSON.stringify(stores.peek.kitchen());

    const out = await handleUpdate(tap(CHEF, approve), stores);
    expect(out).toEqual([
      {
        kind: "answer",
        callbackId: expect.any(String),
        text: "This needs Management.",
        alert: true,
      },
    ]);
    expect(stores.peek.thread("t1")?.status).toBe("awaiting");
    expect(JSON.stringify(stores.peek.kitchen())).toBe(kitchenBefore);
  });

  it("ignores a second tap on a question that was already answered", async () => {
    const stores = await setup();
    const asked = await handleUpdate(msg(CHEF, "/plan dinner in 2 days"), stores);
    const approve = dataFor(asked, MGMT, /approve/i)!;
    await handleUpdate(tap(MGMT, approve), stores);
    const orders = (stores.peek.kitchen().orders ?? []).length;

    const again = await handleUpdate(tap(MGMT, approve, "Old message"), stores);
    expect(again[0]).toMatchObject({ kind: "answer", alert: true });
    expect(again.find((o) => o.kind === "edit")).toMatchObject({
      text: expect.stringContaining("Already answered"),
    });
    expect((stores.peek.kitchen().orders ?? []).length).toBe(orders);
  });

  it("tells the transport to retire everyone's copy of a question once it is answered", async () => {
    const stores = await setup(shortageKitchen("lunch"));
    const asked = await handleUpdate(msg(CHEF, "/plan lunch tomorrow"), stores);
    const questionId = to(asked, CHEF)?.questionId;
    expect(questionId).toBeDefined();
    // The Chef and Management both hold the question; the caregiver only follows along.
    expect(to(asked, MGMT)?.questionId).toBe(questionId);
    expect(to(asked, CARE)?.questionId).toBeUndefined();

    const out = await handleUpdate(tap(CHEF, dataFor(asked, CHEF, /yes/i)!), stores);
    expect(out.filter((o) => o.kind === "retire")).toEqual([
      { kind: "retire", questionId, text: "✔ Chris (Chef) chose: Yes, use it" },
    ]);
  });

  it("handles the same Telegram update only once", async () => {
    const stores = await setup();
    const update = msg(CHEF, "/plan dinner in 2 days");
    expect((await handleUpdate(update, stores)).length).toBeGreaterThan(0);
    expect(await handleUpdate(update, stores)).toEqual([]);
    expect(stores.peek.thread("t2")).toBeUndefined();
  });

  it("walks a swap through to the end: Chef taps yes, then approves", async () => {
    const stores = await setup(shortageKitchen("lunch"));
    const asked = await handleUpdate(msg(CHEF, "/plan lunch tomorrow"), stores);
    expect(to(asked, CHEF)?.text).toMatch(/I can't get/);
    const yes = dataFor(asked, CHEF, /yes/i)!;

    const swapped = await handleUpdate(tap(CHEF, yes), stores);
    expect(to(swapped, CARE)?.text).toMatch(/Re-checked/);
    const thread = stores.peek.thread("t1")!;
    expect(thread.question?.kind).toBe("approve");
    const approver = thread.question!.to === "management" ? MGMT : CHEF;

    const done = await handleUpdate(tap(approver, dataFor(swapped, approver, /approve/i)!), stores);
    expect(stores.peek.thread("t1")?.status).toBe("done");
    expect(to(done, CARE)?.text).toMatch(/Saved/);
    expect(stores.peek.kitchen().mealApprovals?.["2026-11-12"]?.lunch).toBeDefined();
  });

  it("lets someone stop the whole thing", async () => {
    const stores = await setup(shortageKitchen("lunch"));
    const asked = await handleUpdate(msg(CHEF, "/plan lunch tomorrow"), stores);
    const kitchenBefore = JSON.stringify(stores.peek.kitchen());
    const out = await handleUpdate(tap(CHEF, dataFor(asked, CHEF, /stop/i)!), stores);
    expect(to(out, MGMT)?.text).toMatch(/Nothing was changed/);
    expect(stores.peek.thread("t1")?.status).toBe("stopped");
    expect(JSON.stringify(stores.peek.kitchen())).toBe(kitchenBefore);
  });
});

describe("telegram: messages", () => {
  it("keeps button data inside Telegram's 64-byte limit, even for long ids", () => {
    expect(
      new TextEncoder().encode(answerData("tmgu5x2k9abcd-q12", "another")).length,
    ).toBeLessThanOrEqual(64);
    expect(
      new TextEncoder().encode(answerData(`t${"x".repeat(40)}-q9`, "yes")).length,
    ).toBeLessThanOrEqual(64);
  });

  it("shows who is talking to whom", () => {
    expect(
      renderEvent({
        id: "e",
        from: "inventory",
        to: "menu",
        kind: "handoff",
        tone: "alert",
        text: "I can't get chicken.",
      }),
    ).toBe("📦 Inventory → Menu: I can't get chicken.");
    expect(
      renderEvent({
        id: "e",
        from: "chef",
        to: "all",
        kind: "decision",
        tone: "ok",
        text: "Approved.",
      }),
    ).toBe("👨‍🍳 Chef: Approved.");
  });

  it("never sends a message longer than Telegram allows", async () => {
    const stores = await setup();
    const out = await handleUpdate(msg(CHEF, "/plan dinner in 2 days"), stores);
    for (const o of sends(out)) expect(o.text.length).toBeLessThanOrEqual(4096);
  });
});
