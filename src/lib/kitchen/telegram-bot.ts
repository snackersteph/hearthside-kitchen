import {
  answerFlow,
  canAnswer,
  FlowError,
  startFlow,
  type FlowAction,
  type FlowOptionId,
  type FlowThread,
} from "./agent-flow";
import type { RoomActor, RoomEvent } from "./agent-room";
import { dayLabel } from "./agent-room";
import { can, ROLE_LABEL, type RoomRole } from "./agent-room-access";
import { dateKey, dayAt } from "./schedule";
import { reducer } from "./store";
import { MEALS, type KitchenState, type Meal } from "./types";

/**
 * The Telegram front end for the Agent Room, written as a pure handler:
 * (update, stores) -> the messages to send. It never calls Telegram itself, so every behaviour here
 * is tested with fake updates, and a thin runner does the HTTP. The same flow engine and the same
 * permission checks serve the web app, so Telegram cannot do anything the web app would refuse.
 *
 * Everyone linked to the bot shares one room: they all see the conversation, and only the people
 * allowed to answer a question get its buttons.
 */

/* ---------------------------------------------------------------- */
/* Types                                                             */
/* ---------------------------------------------------------------- */

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    from?: { id: number; first_name?: string };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name?: string };
    message?: { message_id: number; chat: { id: number }; text?: string };
    data?: string;
  };
}

export interface BotUser {
  telegramId: number;
  chatId: number;
  name: string;
  role: RoomRole;
}

export interface Button {
  text: string;
  data: string;
}

export type Outbound =
  | { kind: "send"; chatId: number; text: string; buttons?: Button[][]; questionId?: string }
  | { kind: "edit"; chatId: number; messageId: number; text: string }
  /**
   * A question was answered, so every copy of it that is still tappable (in every chat) should lose its
   * buttons and get this note. The transport remembers which messages it sent for each question.
   */
  | { kind: "retire"; questionId: string; text: string }
  | { kind: "answer"; callbackId: string; text?: string; alert?: boolean };

export interface BotStores {
  users: {
    get(telegramId: number): Promise<BotUser | undefined>;
    save(user: BotUser): Promise<void>;
    all(): Promise<BotUser[]>;
  };
  threads: {
    get(id: string): Promise<FlowThread | undefined>;
    save(thread: FlowThread): Promise<void>;
  };
  kitchen: { load(): Promise<KitchenState>; apply(actions: FlowAction[]): Promise<void> };
  /** Telegram resends an update if we answer slowly, so each update id is handled once. */
  seen?: { has(updateId: number): Promise<boolean>; add(updateId: number): Promise<void> };
  /** Invite code -> role. Keep these secret: whoever has a code can join as that role. */
  invites: Record<string, RoomRole>;
  now?: () => Date;
  newId?: () => string;
}

/* ---------------------------------------------------------------- */
/* Reading what people type                                          */
/* ---------------------------------------------------------------- */

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MEAL_LETTER: Record<string, Meal> = { b: "breakfast", l: "lunch", d: "dinner" };
const LETTER_OF: Record<Meal, string> = { breakfast: "b", lunch: "l", dinner: "d" };

export type PlanRequest =
  | { ok: true; date: string; meal: Meal }
  | { ok: false; reason: "no-meal"; date: string }
  | { ok: false; reason: "bad-day"; message: string };

/** "/plan lunch tomorrow", "dinner fri", "plan breakfast in 3 days": the day defaults to tomorrow. */
export function parsePlanRequest(text: string, reference: Date): PlanRequest {
  const t = text.toLowerCase();
  const meal = MEALS.find((m) => t.includes(m));
  let offset = 1;
  const inDays = /\bin\s+(\d+)\s+days?\b/.exec(t);
  const weekday = WEEKDAYS.findIndex((d) => new RegExp(`\\b${d}[a-z]*\\b`).test(t));
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(t);
  if (/\btoday\b/.test(t))
    return {
      ok: false,
      reason: "bad-day",
      message: "Plans start tomorrow. Today's service is already locked in.",
    };
  if (iso?.[1]) {
    const diff = Math.round(
      (new Date(`${iso[1]}T12:00:00`).getTime() -
        new Date(`${dateKey(reference)}T12:00:00`).getTime()) /
        86_400_000,
    );
    offset = diff;
  } else if (inDays?.[1]) offset = Number(inDays[1]);
  else if (weekday >= 0 && !/\btomorrow\b/.test(t))
    offset = (weekday - reference.getDay() + 7) % 7 || 7;
  if (offset < 1 || offset > 6)
    return {
      ok: false,
      reason: "bad-day",
      message: "I can plan from tomorrow up to six days ahead.",
    };
  const date = dateKey(dayAt(offset, reference));
  return meal ? { ok: true, date, meal } : { ok: false, reason: "no-meal", date };
}

/* ---------------------------------------------------------------- */
/* Writing what we send                                              */
/* ---------------------------------------------------------------- */

const NAME: Record<RoomActor | "all", string> = {
  dietary: "Dietary",
  menu: "Menu",
  inventory: "Inventory",
  chef: "Chef",
  management: "Management",
  all: "everyone",
};
const ICON: Record<RoomActor, string> = {
  dietary: "🛡️",
  menu: "🍽️",
  inventory: "📦",
  chef: "👨‍🍳",
  management: "🧑‍💼",
};
const LIMIT = 4000; // Telegram allows 4096 characters per message.

export const renderEvent = (e: RoomEvent) =>
  `${ICON[e.from]} ${NAME[e.from]}${e.to === "all" || e.to === e.from ? "" : ` → ${NAME[e.to]}`}: ${e.text}`;

function clip(text: string): string {
  return text.length <= LIMIT ? text : `${text.slice(0, LIMIT - 1)}…`;
}

const OPTION_LETTER: Record<FlowOptionId, string> = { yes: "y", another: "a", stop: "s" };
const LETTER_OPTION: Record<string, FlowOptionId> = { y: "yes", a: "another", s: "stop" };

export const answerData = (questionId: string, option: FlowOptionId) =>
  `a|${questionId}|${OPTION_LETTER[option]}`;
export const mealData = (date: string, meal: Meal) => `m|${date}|${LETTER_OF[meal]}`;

const HELP = [
  "I'm the NutriSync kitchen room. Everyone linked here sees what the agents say.",
  "",
  "• /plan lunch tomorrow  (or dinner fri, breakfast in 3 days)",
  "• /whoami  to see your role",
  "",
  "Tap the buttons when an agent asks you something.",
].join("\n");

/* ---------------------------------------------------------------- */
/* The handler                                                       */
/* ---------------------------------------------------------------- */

export async function handleUpdate(update: TelegramUpdate, stores: BotStores): Promise<Outbound[]> {
  if (await stores.seen?.has(update.update_id)) return [];
  await stores.seen?.add(update.update_id);
  if (update.message) return handleMessage(update.message, stores);
  if (update.callback_query) return handleCallback(update.callback_query, stores);
  return [];
}

async function handleMessage(
  message: NonNullable<TelegramUpdate["message"]>,
  stores: BotStores,
): Promise<Outbound[]> {
  const text = (message.text ?? "").trim();
  const chatId = message.chat.id;
  const from = message.from;
  const reply = (body: string, buttons?: Button[][]): Outbound[] => [
    { kind: "send", chatId, text: body, ...(buttons ? { buttons } : {}) },
  ];
  if (!from || !text) return [];

  if (/^\/start\b/i.test(text)) {
    const code = text.split(/\s+/)[1];
    const existing = await stores.users.get(from.id);
    if (!code)
      return reply(
        existing
          ? `You're linked as ${ROLE_LABEL[existing.role]}.\n\n${HELP}`
          : "Welcome. Send /start followed by your invite code to join the kitchen room.",
      );
    const role = stores.invites[code];
    if (!role) return reply("That invite code isn't valid. Ask the kitchen team for a new one.");
    await stores.users.save({
      telegramId: from.id,
      chatId,
      name: from.first_name ?? "Someone",
      role,
    });
    return reply(`You're in. Your role: ${ROLE_LABEL[role]}.\n\n${HELP}`);
  }

  const user = await stores.users.get(from.id);
  if (!user) return reply("Please link your account first: send /start and your invite code.");
  if (/^\/(help|whoami)\b/i.test(text))
    return reply(/^\/whoami/i.test(text) ? `You're ${user.name}, ${ROLE_LABEL[user.role]}.` : HELP);

  const looksLikePlan =
    /^\/plan\b/i.test(text) || MEALS.some((m) => text.toLowerCase().includes(m));
  if (!looksLikePlan) return reply(HELP);

  const request = parsePlanRequest(text, (stores.now ?? (() => new Date()))());
  if (!request.ok) {
    if (request.reason === "bad-day") return reply(request.message);
    // The agent needs one more detail, so it asks, and waits for the tap.
    return reply(`Which meal for ${dayLabel(request.date)}?`, [
      MEALS.map((m) => ({
        text: m[0]!.toUpperCase() + m.slice(1),
        data: mealData(request.date, m),
      })),
    ]);
  }
  return startAndShare(user, request.date, request.meal, stores);
}

async function handleCallback(
  query: NonNullable<TelegramUpdate["callback_query"]>,
  stores: BotStores,
): Promise<Outbound[]> {
  const ack = (text?: string, alert = false): Outbound => ({
    kind: "answer",
    callbackId: query.id,
    ...(text ? { text } : {}),
    ...(alert ? { alert: true } : {}),
  });
  const user = await stores.users.get(query.from.id);
  if (!user) return [ack("Link your account first: send /start and your invite code.", true)];
  const [kind, a, b] = (query.data ?? "").split("|");

  if (kind === "m" && a && b && MEAL_LETTER[b]) {
    return [ack(), ...(await startAndShare(user, a, MEAL_LETTER[b]!, stores))];
  }
  if (kind !== "a" || !a || !b || !LETTER_OPTION[b])
    return [ack("I didn't understand that button.", true)];

  const option = LETTER_OPTION[b]!;
  const threadId = a.slice(0, a.lastIndexOf("-q"));
  const thread = await stores.threads.get(threadId);
  if (!thread) return [ack("That conversation no longer exists.", true)];

  const now = (stores.now ?? (() => new Date()))();
  const state = await stores.kitchen.load();
  let result: ReturnType<typeof answerFlow>;
  try {
    result = answerFlow(state, thread, { questionId: a, optionId: option, by: user.role }, now);
  } catch (e) {
    if (!(e instanceof FlowError)) throw e;
    const out: Outbound[] = [ack(e.message, true)];
    // A button that is already answered should stop looking tappable.
    if (e.code === "stale" || e.code === "closed")
      if (query.message)
        out.push({
          kind: "edit",
          chatId: query.message.chat.id,
          messageId: query.message.message_id,
          text: `${query.message.text ?? ""}\n\n(Already answered.)`,
        });
    return out;
  }

  await stores.threads.save(result.thread);
  if (result.effects.length) await stores.kitchen.apply(result.effects);

  const chosen = thread.question?.options.find((o) => o.id === option)?.label ?? option;
  const out: Outbound[] = [ack()];
  if (query.message)
    out.push({
      kind: "edit",
      chatId: query.message.chat.id,
      messageId: query.message.message_id,
      text: `${query.message.text ?? ""}\n\n✔ ${user.name} (${ROLE_LABEL[user.role]}) chose: ${chosen}`,
    });
  // The others in the room still hold a copy of this question: it is answered now, so retire theirs too.
  out.push({
    kind: "retire",
    questionId: a,
    text: `✔ ${user.name} (${ROLE_LABEL[user.role]}) chose: ${chosen}`,
  });
  out.push(
    ...(await share(result.thread, result.thread.events.slice(thread.events.length), stores)),
  );
  return out;
}

async function startAndShare(
  user: BotUser,
  date: string,
  meal: Meal,
  stores: BotStores,
): Promise<Outbound[]> {
  const permission = can(user.role, "request-plan");
  if (!permission.allowed)
    return [
      { kind: "send", chatId: user.chatId, text: permission.reason ?? "You can't ask for plans." },
    ];
  const state = await stores.kitchen.load();
  try {
    const { thread } = startFlow(state, {
      id: (stores.newId ?? defaultId)(),
      date,
      meal,
      by: user.role,
      reference: (stores.now ?? (() => new Date()))(),
    });
    await stores.threads.save(thread);
    return share(thread, thread.events, stores);
  } catch (e) {
    if (e instanceof FlowError) return [{ kind: "send", chatId: user.chatId, text: e.message }];
    throw e;
  }
}

/** Everyone linked sees the conversation; only people allowed to answer get the buttons. */
async function share(
  thread: FlowThread,
  events: RoomEvent[],
  stores: BotStores,
): Promise<Outbound[]> {
  const users = await stores.users.all();
  const body = events.map(renderEvent).join("\n\n");
  const header = `${thread.meal[0]!.toUpperCase()}${thread.meal.slice(1)} · ${dayLabel(thread.date)}`;
  return users.map((u): Outbound => {
    const question = thread.status === "awaiting" ? thread.question : undefined;
    const waiting =
      question && !canAnswer(u.role, question).allowed
        ? `\n\n⏳ Waiting for ${question.to === "management" ? "Management" : "the Chef"}.`
        : "";
    const buttons =
      question && canAnswer(u.role, question).allowed
        ? [question.options.map((o) => ({ text: o.label, data: answerData(question.id, o.id) }))]
        : undefined;
    return {
      kind: "send",
      chatId: u.chatId,
      text: clip(`${header}\n\n${body}${waiting}`),
      ...(buttons && question ? { buttons, questionId: question.id } : {}),
    };
  });
}

const defaultId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* ---------------------------------------------------------------- */
/* An in-memory version of the stores, for tests and local demos      */
/* ---------------------------------------------------------------- */

export function memoryStores(
  initial: KitchenState,
  invites: Record<string, RoomRole>,
  now: () => Date = () => new Date(),
): BotStores & {
  peek: { kitchen: () => KitchenState; thread: (id: string) => FlowThread | undefined };
} {
  const users = new Map<number, BotUser>();
  const threads = new Map<string, FlowThread>();
  const seen = new Set<number>();
  let kitchen = initial;
  let counter = 0;
  return {
    users: {
      get: async (id) => users.get(id),
      save: async (u) => void users.set(u.telegramId, u),
      all: async () => [...users.values()],
    },
    threads: {
      get: async (id) => (threads.has(id) ? structuredClone(threads.get(id)) : undefined),
      save: async (t) => void threads.set(t.id, structuredClone(t)),
    },
    kitchen: {
      load: async () => kitchen,
      apply: async (actions) =>
        void (kitchen = actions.reduce((s, a) => reducer(s, a, now()), kitchen)),
    },
    seen: { has: async (id) => seen.has(id), add: async (id) => void seen.add(id) },
    invites,
    now,
    newId: () => `t${++counter}`,
    peek: { kitchen: () => kitchen, thread: (id) => threads.get(id) },
  };
}
