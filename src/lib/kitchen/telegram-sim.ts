import type { FlowAction } from "./agent-flow";
import type { RoomRole } from "./agent-room-access";
import {
  handleUpdate,
  memoryStores,
  type BotStores,
  type Button,
  type Outbound,
  type TelegramUpdate,
} from "./telegram-bot";
import type { KitchenState } from "./types";

/**
 * Three "phones" that run the REAL Telegram bot logic in the browser, so the whole thing can be tried
 * before a real bot exists. Only the transport is pretend: a phone's chat replaces Telegram's servers.
 * Everything else (linking, roles, the agents' questions, the buttons, the kitchen changes) is the same
 * code a real Telegram webhook will call.
 */

export const DEMO_USERS = [
  { id: 1, name: "Chris", role: "chef", code: "CHEF-DEMO" },
  { id: 2, name: "Morgan", role: "management", code: "MGMT-DEMO" },
  { id: 3, name: "Casey", role: "caregiver", code: "CARE-DEMO" },
] as const satisfies readonly { id: number; name: string; role: RoomRole; code: string }[];

export interface ChatMsg {
  id: number;
  from: "bot" | "me" | "note";
  text: string;
  buttons?: Button[][];
  /** Telegram's id for the message (only on the last bubble of a bot message, the one with buttons). */
  messageId?: number;
  /** The agent question the buttons answer, so they can be retired when someone else answers it. */
  questionId?: string;
  /** Bubbles appear one by one, so you can watch the agents talk. */
  visible: boolean;
}

export type Chats = Record<number, ChatMsg[]>;

/** A bot message arrives as one block of text; the phone shows each paragraph as its own bubble. */
export const splitBlocks = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

export function emptyChats(): Chats {
  return Object.fromEntries(DEMO_USERS.map((u) => [u.id, [] as ChatMsg[]]));
}

/** Add what the bot returned. `tapperChat` is where a "popup" answer (like a refusal) should show. */
export function applyOutbound(
  chats: Chats,
  out: Outbound[],
  nextId: () => number,
  tapperChat?: number,
): Chats {
  const next: Chats = Object.fromEntries(
    Object.entries(chats).map(([k, v]) => [Number(k), [...v]]),
  );
  for (const o of out) {
    if (o.kind === "send") {
      const blocks = splitBlocks(o.text);
      const chat = (next[o.chatId] ??= []);
      blocks.forEach((text, i) => {
        const last = i === blocks.length - 1;
        chat.push({
          id: nextId(),
          from: "bot",
          text,
          visible: false,
          ...(last && o.buttons ? { buttons: o.buttons } : {}),
          ...(last && o.buttons && o.questionId ? { questionId: o.questionId } : {}),
          ...(last ? { messageId: nextId() } : {}),
        });
      });
    } else if (o.kind === "edit") {
      const chat = next[o.chatId] ?? [];
      const at = chat.findIndex((m) => m.messageId === o.messageId);
      if (at >= 0) {
        const { buttons: _gone, ...rest } = chat[at]!;
        chat[at] = { ...rest, text: o.text };
      }
    } else if (o.kind === "retire") {
      // Someone answered: every phone still showing this question's buttons loses them.
      for (const chat of Object.values(next))
        chat.forEach((m, i) => {
          if (m.questionId !== o.questionId || !m.buttons) return;
          const { buttons: _gone, ...rest } = m;
          chat[i] = { ...rest, text: `${m.text}\n\n${o.text}` };
        });
    } else if (o.text && tapperChat !== undefined) {
      (next[tapperChat] ??= []).push({ id: nextId(), from: "note", text: o.text, visible: true });
    }
  }
  return next;
}

export const hasHidden = (chats: Chats) =>
  Object.values(chats).some((c) => c.some((m) => !m.visible));

/** Show the next waiting bubble on every phone. */
export function revealNext(chats: Chats): Chats {
  return Object.fromEntries(
    Object.entries(chats).map(([k, msgs]) => {
      const at = msgs.findIndex((m) => !m.visible);
      return [
        Number(k),
        at < 0 ? msgs : msgs.map((m, i) => (i === at ? { ...m, visible: true } : m)),
      ];
    }),
  );
}

/**
 * The room: three phones talking to one bot. Plain TypeScript with a tiny subscribe API, so it is easy to
 * test and the React page stays thin.
 */
export class TelegramSimulation {
  private chatsState: Chats = emptyChats();
  private listeners = new Set<() => void>();
  private stores: BotStores;
  private ids = { update: 0, msg: 0 };
  private busy: Promise<unknown> = Promise.resolve();

  constructor(
    private getState: () => KitchenState,
    private applyActions: (actions: FlowAction[]) => void,
    private now: () => Date = () => new Date(),
  ) {
    this.stores = this.makeStores();
  }

  /** A fresh bot: nobody linked yet, no conversations. */
  private makeStores(): BotStores {
    const invites = Object.fromEntries(DEMO_USERS.map((u) => [u.code, u.role]));
    const base = memoryStores(this.getState(), invites, this.now);
    return {
      ...base,
      kitchen: {
        load: async () => this.getState(),
        // The host applies the actions to the real kitchen, so the rest of the app changes too.
        apply: async (actions) => this.applyActions(actions),
      },
    };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  snapshot = () => this.chatsState;
  private set(chats: Chats) {
    this.chatsState = chats;
    this.listeners.forEach((l) => l());
  }
  private nextMsgId = () => ++this.ids.msg;

  /** Link the three demo people, exactly as they would by sending their invite codes. */
  join() {
    return this.enqueue(async () => {
      for (const u of DEMO_USERS)
        await this.deliver({
          update_id: ++this.ids.update,
          message: {
            message_id: this.nextMsgId(),
            chat: { id: u.id },
            from: { id: u.id, first_name: u.name },
            text: `/start ${u.code}`,
          },
        });
    });
  }

  /** A person types a message on their phone. */
  say(chatId: number, text: string) {
    const user = DEMO_USERS.find((u) => u.id === chatId);
    if (!user || !text.trim()) return Promise.resolve();
    this.set({
      ...this.chatsState,
      [chatId]: [
        ...(this.chatsState[chatId] ?? []),
        { id: this.nextMsgId(), from: "me", text: text.trim(), visible: true },
      ],
    });
    return this.enqueue(() =>
      this.deliver({
        update_id: ++this.ids.update,
        message: {
          message_id: this.nextMsgId(),
          chat: { id: chatId },
          from: { id: chatId, first_name: user.name },
          text: text.trim(),
        },
      }),
    );
  }

  /** A person taps an inline button under a bot message. */
  press(chatId: number, messageId: number, text: string, data: string) {
    const user = DEMO_USERS.find((u) => u.id === chatId);
    if (!user) return Promise.resolve();
    return this.enqueue(() =>
      this.deliver(
        {
          update_id: ++this.ids.update,
          callback_query: {
            id: `cb${this.ids.update}`,
            from: { id: chatId, first_name: user.name },
            message: { message_id: messageId, chat: { id: chatId }, text },
            data,
          },
        },
        chatId,
      ),
    );
  }

  reveal() {
    if (hasHidden(this.chatsState)) this.set(revealNext(this.chatsState));
  }

  /** Start over with a fresh bot and empty phones (then call join() again). */
  reset() {
    this.stores = this.makeStores();
    this.chatsState = emptyChats();
    this.listeners.forEach((l) => l());
  }

  /** One update at a time, in order, like a real webhook queue. */
  private enqueue(job: () => Promise<void>) {
    this.busy = this.busy.then(job, job);
    return this.busy as Promise<void>;
  }

  private async deliver(update: TelegramUpdate, tapperChat?: number) {
    try {
      const out = await handleUpdate(update, this.stores);
      this.set(applyOutbound(this.chatsState, out, this.nextMsgId, tapperChat));
    } catch (e) {
      const chat = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
      if (chat !== undefined)
        this.set(
          applyOutbound(
            this.chatsState,
            [
              {
                kind: "answer",
                callbackId: "err",
                text: `Something went wrong: ${e instanceof Error ? e.message : String(e)}`,
              },
            ],
            this.nextMsgId,
            chat,
          ),
        );
    }
  }
}
