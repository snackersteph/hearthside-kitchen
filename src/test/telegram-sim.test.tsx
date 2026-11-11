import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TelegramPhone } from "@/components/kitchen/telegram-phone";
import { DISHES, dishById, initialState } from "@/lib/kitchen/data";
import { resolveMenuState } from "@/lib/kitchen/engine";
import type { FlowAction } from "@/lib/kitchen/agent-flow";
import { reducer, seedDemo } from "@/lib/kitchen/store";
import type { Outbound } from "@/lib/kitchen/telegram-bot";
import {
  applyOutbound,
  DEMO_USERS,
  emptyChats,
  hasHidden,
  revealNext,
  splitBlocks,
  TelegramSimulation,
  type ChatMsg,
  type Chats,
} from "@/lib/kitchen/telegram-sim";
import type { KitchenState, Meal } from "@/lib/kitchen/types";

afterEach(cleanup);

const reference = new Date("2026-11-11T12:00:00"); // a Wednesday
const CHRIS = 1;
const MORGAN = 2;
const CASEY = 3;

let counter = 0;
const nextId = () => ++counter;

const seeded = () => seedDemo(initialState(), reference);

/** Tomorrow's planned dish with its rarest ingredient out of stock, so the agents must propose a swap. */
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

/** A simulation wired to a tiny "real kitchen", like the page does. */
function room(initial: KitchenState = seeded()) {
  let kitchen = initial;
  const applied: FlowAction[][] = [];
  const sim = new TelegramSimulation(
    () => kitchen,
    (actions) => {
      applied.push(actions);
      for (const a of actions) kitchen = reducer(kitchen, a, reference);
    },
    () => reference,
  );
  return { sim, kitchen: () => kitchen, applied };
}

/** Let every waiting bubble appear, like the page's timer does. */
const settle = (sim: TelegramSimulation) => {
  while (hasHidden(sim.snapshot())) sim.reveal();
};
const withButtons = (sim: TelegramSimulation, chat: number) =>
  sim.snapshot()[chat]!.filter((m) => m.visible && m.buttons);
const tapFirst = (sim: TelegramSimulation, chat: number, label: RegExp) => {
  const m = withButtons(sim, chat).at(-1)!;
  const button = m.buttons!.flat().find((b) => label.test(b.text))!;
  return sim.press(chat, m.messageId!, m.text, button.data);
};
const lastText = (sim: TelegramSimulation, chat: number) => sim.snapshot()[chat]!.at(-1)?.text;

describe("telegram phones: the chat model", () => {
  it("shows each paragraph of a bot message as its own bubble", () => {
    expect(splitBlocks("One\n\nTwo\n \nThree\n\n\n")).toEqual(["One", "Two", "Three"]);
  });

  it("puts the buttons and the message id on the last bubble only, and holds bubbles back", () => {
    const chats = applyOutbound(
      emptyChats(),
      [
        {
          kind: "send",
          chatId: CHRIS,
          text: "First\n\nSecond\n\nAsk",
          buttons: [[{ text: "Yes", data: "a|q|y" }]],
          questionId: "q",
        },
      ],
      nextId,
    );
    const bubbles = chats[CHRIS]!;
    expect(bubbles.map((b) => b.text)).toEqual(["First", "Second", "Ask"]);
    expect(bubbles.map((b) => b.visible)).toEqual([false, false, false]);
    expect(bubbles.map((b) => b.buttons !== undefined)).toEqual([false, false, true]);
    expect(bubbles[2]).toMatchObject({ questionId: "q" });
    expect(bubbles[2]!.messageId).toBeDefined();
    expect(bubbles[0]!.messageId).toBeUndefined();
  });

  it("reveals one bubble per phone at a time", () => {
    const chats = applyOutbound(
      emptyChats(),
      [
        { kind: "send", chatId: CHRIS, text: "A\n\nB" },
        { kind: "send", chatId: MORGAN, text: "C" },
      ],
      nextId,
    );
    expect(hasHidden(chats)).toBe(true);
    const one = revealNext(chats);
    expect(one[CHRIS]!.map((b) => b.visible)).toEqual([true, false]);
    expect(one[MORGAN]!.map((b) => b.visible)).toEqual([true]);
    expect(hasHidden(revealNext(one))).toBe(false);
  });

  it("edits a message in place and drops its buttons", () => {
    const sent = applyOutbound(
      emptyChats(),
      [{ kind: "send", chatId: CHRIS, text: "Ask", buttons: [[{ text: "Yes", data: "a|q|y" }]] }],
      nextId,
    );
    const messageId = sent[CHRIS]![0]!.messageId!;
    const edited = applyOutbound(
      sent,
      [{ kind: "edit", chatId: CHRIS, messageId, text: "Ask\n\n✔ done" }],
      nextId,
    );
    expect(edited[CHRIS]![0]).toMatchObject({ text: "Ask\n\n✔ done" });
    expect(edited[CHRIS]![0]!.buttons).toBeUndefined();
  });

  it("retires every other copy of an answered question, and only that question", () => {
    const ask = (chatId: number, questionId: string): Outbound => ({
      kind: "send",
      chatId,
      text: `Question ${questionId}`,
      buttons: [[{ text: "Yes", data: `a|${questionId}|y` }]],
      questionId,
    });
    const before = applyOutbound(
      emptyChats(),
      [ask(CHRIS, "q1"), ask(MORGAN, "q1"), ask(MORGAN, "q2")],
      nextId,
    );
    const after = applyOutbound(
      before,
      [{ kind: "retire", questionId: "q1", text: "✔ Chris chose: Yes" }],
      nextId,
    );
    expect(after[CHRIS]![0]).toMatchObject({ text: "Question q1\n\n✔ Chris chose: Yes" });
    expect(after[CHRIS]![0]!.buttons).toBeUndefined();
    expect(after[MORGAN]![0]!.buttons).toBeUndefined();
    // another question's buttons are left alone
    expect(after[MORGAN]![1]!.buttons).toBeDefined();
    // nothing is mutated in place
    expect(before[CHRIS]![0]!.buttons).toBeDefined();
  });

  it("shows a refusal as a note on the phone that tapped, and nowhere else", () => {
    const out: Outbound[] = [
      { kind: "answer", callbackId: "c1", text: "This needs Management.", alert: true },
    ];
    const chats: Chats = applyOutbound(emptyChats(), out, nextId, CHRIS);
    expect(chats[CHRIS]).toEqual([
      expect.objectContaining({ from: "note", text: "This needs Management.", visible: true }),
    ]);
    expect(chats[MORGAN]).toEqual([]);
    // a silent acknowledgement adds nothing
    expect(
      applyOutbound(emptyChats(), [{ kind: "answer", callbackId: "c2" }], nextId, CHRIS)[CHRIS],
    ).toEqual([]);
  });
});

describe("telegram phones: the live room", () => {
  it("links the three people and tells each their role", async () => {
    const { sim } = room();
    await sim.join();
    settle(sim);
    for (const u of DEMO_USERS) {
      const first = sim
        .snapshot()
        [u.id]!.map((m) => m.text)
        .join(" ");
      expect(first).toMatch(
        new RegExp(
          `Your role: ${u.role === "management" ? "Management" : u.role === "chef" ? "Chef" : "Caregiver"}`,
        ),
      );
    }
  });

  it("asks the Chef a real question, and the answer changes the kitchen", async () => {
    const { sim, kitchen, applied } = room(shortageKitchen("lunch"));
    await sim.join();
    await sim.say(CHRIS, "/plan lunch tomorrow");
    settle(sim);

    // The agents asked; the Chef can answer, the caregiver can only wait.
    expect(withButtons(sim, CHRIS)).toHaveLength(1);
    expect(withButtons(sim, CASEY)).toHaveLength(0);
    expect(lastText(sim, CASEY)).toMatch(/Waiting for the Chef/);
    expect(applied).toHaveLength(0);

    await tapFirst(sim, CHRIS, /yes/i);
    settle(sim);
    // They re-checked and asked again; still nothing has changed in the kitchen.
    expect(sim.snapshot()[CASEY]!.some((m) => /Re-checked/.test(m.text))).toBe(true);
    expect(applied).toHaveLength(0);

    const approver =
      withButtons(sim, MORGAN).length && !withButtons(sim, CHRIS).length ? MORGAN : CHRIS;
    await tapFirst(sim, approver, /approve/i);
    settle(sim);
    expect(applied).toHaveLength(1);
    expect(kitchen().mealApprovals?.["2026-11-12"]?.lunch).toBeDefined();
    expect(sim.snapshot()[CASEY]!.some((m) => /Saved/.test(m.text))).toBe(true);
  });

  it("takes the buttons off the other phone as soon as one person answers", async () => {
    const { sim } = room(shortageKitchen("lunch"));
    await sim.join();
    await sim.say(CHRIS, "/plan lunch tomorrow");
    settle(sim);
    // Management can answer too, so both phones hold the same question.
    expect(withButtons(sim, CHRIS)).toHaveLength(1);
    expect(withButtons(sim, MORGAN)).toHaveLength(1);

    await tapFirst(sim, CHRIS, /yes/i);
    settle(sim);
    const morganOldQuestion = sim
      .snapshot()
      [MORGAN]!.find((m) => /✔ Chris \(Chef\) chose: Yes, use it/.test(m.text));
    expect(morganOldQuestion).toBeDefined();
    expect(morganOldQuestion!.buttons).toBeUndefined();
    // Morgan's only tappable buttons now belong to the new question.
    for (const m of withButtons(sim, MORGAN)) expect(m.text).not.toMatch(/chose: Yes, use it/);
  });

  it("keeps an expensive order waiting for Management, and only Management can approve it", async () => {
    const { sim, kitchen, applied } = room();
    await sim.join();
    await sim.say(CHRIS, "/plan dinner in 2 days");
    settle(sim);

    expect(withButtons(sim, MORGAN)).toHaveLength(1);
    expect(withButtons(sim, CHRIS)).toHaveLength(0);
    expect(lastText(sim, CHRIS)).toMatch(/Waiting for Management/);
    const ordersBefore = (kitchen().orders ?? []).length;

    await tapFirst(sim, MORGAN, /approve/i);
    settle(sim);
    expect(applied).toHaveLength(1);
    expect((kitchen().orders ?? []).length).toBeGreaterThan(ordersBefore);
    expect(kitchen().mealApprovals?.["2026-11-13"]?.dinner).toBeDefined();
    // every phone tells the story, and no button is left to tap twice
    expect(sim.snapshot()[CHRIS]!.some((m) => /Approved|Saved|Placed/.test(m.text))).toBe(true);
    for (const u of DEMO_USERS) expect(withButtons(sim, u.id)).toHaveLength(0);
  });

  it("won't let a caregiver start a plan", async () => {
    const { sim, applied } = room();
    await sim.join();
    await sim.say(CASEY, "/plan lunch tomorrow");
    settle(sim);
    expect(lastText(sim, CASEY)).toMatch(/can't ask for plans/);
    expect(lastText(sim, CHRIS)).not.toMatch(/Menu →/);
    expect(applied).toHaveLength(0);
  });

  it("shows what the person typed straight away", async () => {
    const { sim } = room();
    await sim.join();
    const pending = sim.say(CHRIS, "  /help  ");
    expect(sim.snapshot()[CHRIS]!.at(-1)).toMatchObject({
      from: "me",
      text: "/help",
      visible: true,
    });
    await pending;
    expect(await sim.say(CHRIS, "   ")).toBeUndefined();
    expect(await sim.say(99, "hello")).toBeUndefined();
  });

  it("starts over with empty phones and a fresh bot", async () => {
    const { sim } = room();
    await sim.join();
    await sim.say(CHRIS, "/plan dinner in 2 days");
    sim.reset();
    expect(Object.values(sim.snapshot()).every((c) => c.length === 0)).toBe(true);
    // nobody is linked any more, so the bot asks them to link first
    await sim.say(CHRIS, "/plan lunch tomorrow");
    settle(sim);
    expect(lastText(sim, CHRIS)).toMatch(/link your account first/i);
  });

  it("tells subscribers when something changes", async () => {
    const { sim } = room();
    const listener = vi.fn();
    const stop = sim.subscribe(listener);
    await sim.join();
    expect(listener).toHaveBeenCalled();
    const calls = listener.mock.calls.length;
    stop();
    sim.reveal();
    await sim.say(CHRIS, "/help");
    expect(listener.mock.calls.length).toBe(calls);
  });
});

describe("TelegramPhone", () => {
  const bubble = (over: Partial<ChatMsg>): ChatMsg => ({
    id: ++counter,
    from: "bot",
    text: "Hello",
    visible: true,
    ...over,
  });
  const renderPhone = (
    messages: ChatMsg[],
    extra: { onSend?: () => void; onPress?: () => void } = {},
  ) => {
    const onSend = vi.fn(extra.onSend);
    const onPress = vi.fn(extra.onPress);
    render(
      <TelegramPhone
        name="Chris"
        roleLabel="Chef"
        messages={messages}
        suggestions={["/plan lunch tomorrow"]}
        onSend={onSend}
        onPress={onPress}
      />,
    );
    return { onSend, onPress, phone: screen.getByRole("region", { name: "Chris's phone" }) };
  };

  it("shows who it is and says it is connecting before anything arrives", () => {
    const { phone } = renderPhone([]);
    expect(within(phone).getByText("Chris")).toBeTruthy();
    expect(within(phone).getByText(/Chef · chatting with NutriSync Kitchen Bot/)).toBeTruthy();
    expect(within(phone).getByText("Connecting…")).toBeTruthy();
  });

  it("hides bubbles that haven't appeared yet and shows 'typing…' meanwhile", () => {
    const { phone } = renderPhone([
      bubble({ text: "Seen" }),
      bubble({ text: "Not yet", visible: false }),
    ]);
    expect(within(phone).getByText("Seen")).toBeTruthy();
    expect(within(phone).queryByText("Not yet")).toBeNull();
    expect(within(phone).getByText("typing…")).toBeTruthy();
  });

  it("sends a typed message, and a tapped suggestion", () => {
    const { phone, onSend } = renderPhone([bubble({})]);
    const send = within(phone).getByRole("button", { name: "Send" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(within(phone).getByLabelText("Message as Chris"), {
      target: { value: "/help" },
    });
    fireEvent.click(send);
    expect(onSend).toHaveBeenCalledWith("/help");
    fireEvent.click(within(phone).getByRole("button", { name: "/plan lunch tomorrow" }));
    expect(onSend).toHaveBeenLastCalledWith("/plan lunch tomorrow");
  });

  it("reports which message and which button were tapped", () => {
    const asked = bubble({
      text: "Shall I switch?",
      messageId: 7,
      buttons: [
        [
          { text: "Yes, use it", data: "a|q|y" },
          { text: "Stop", data: "a|q|s" },
        ],
      ],
    });
    const { phone, onPress } = renderPhone([asked]);
    fireEvent.click(within(phone).getByRole("button", { name: "Yes, use it" }));
    expect(onPress).toHaveBeenCalledWith(asked, { text: "Yes, use it", data: "a|q|y" });
  });

  it("shows notes as small centred lines, and the person's own words on the right", () => {
    const { phone } = renderPhone([
      bubble({ from: "note", text: "This needs Management." }),
      bubble({ from: "me", text: "/plan dinner" }),
    ]);
    const bubbles = within(phone).getAllByTestId("bubble");
    expect(bubbles.map((b) => b.getAttribute("data-from"))).toEqual(["note", "me"]);
    expect(within(phone).getByText("This needs Management.")).toBeTruthy();
  });
});
