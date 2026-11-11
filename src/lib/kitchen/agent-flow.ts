import { dishById } from "./data";
import { resolveMenuState } from "./engine";
import {
  buildPlan,
  chooseReplacement,
  dayLabel,
  evaluate,
  list,
  MANAGEMENT_APPROVAL_THRESHOLD,
  money,
  narrateDietary,
  narrateInventory,
  offsetOf,
  planActions,
  plural,
  swapReason,
  type Evaluation,
  type NarrationContext,
  type RoomActor,
  type RoomEvent,
  type RoomKind,
  type RoomPlan,
} from "./agent-room";
import { can, ROLE_LABEL, type RoomRole } from "./agent-room-access";
import type { AgentId, KitchenState, Meal } from "./types";

/**
 * The live version of the Agent Room: a conversation that can PAUSE.
 *
 * A thread is plain, serializable data (store it in a database, send it over a wire). The agents run
 * until they need a person, then the thread waits with one open question addressed to one role.
 * When that person answers (from the web app or from Telegram), the flow resumes and re-checks
 * everything against the kitchen as it is THEN, so stock or price changes made while it waited are
 * never ignored. Nothing here touches the kitchen: the flow returns actions for the host to apply.
 *
 * Pure and deterministic. The same function serves every channel, and the permission check lives here
 * (not in a user interface), so no channel can skip it.
 */

export type FlowStatus = "awaiting" | "done" | "stopped";
export type FlowOptionId = "yes" | "another" | "stop";

export interface FlowOption {
  id: FlowOptionId;
  label: string;
}

export interface FlowQuestion {
  id: string;
  /** The role that must answer. Management may also answer anything addressed to the Chef. */
  to: "chef" | "management";
  /** The agent asking. */
  from: AgentId;
  /** "propose" = shall I use this dish instead? "approve" = approve this finished plan. */
  kind: "propose" | "approve";
  prompt: string;
  options: FlowOption[];
  /** The dish the question is about. */
  dishId: string;
}

export interface FlowThread {
  id: string;
  date: string;
  meal: Meal;
  requestedBy: RoomRole;
  status: FlowStatus;
  events: RoomEvent[];
  question?: FlowQuestion;
  /** Dishes already proposed, so "another option" never repeats one. */
  tried: string[];
  /** The plan behind an open approval question. */
  plan?: RoomPlan;
  questionCount: number;
}

export type FlowAction = ReturnType<typeof planActions>[number];

export interface FlowResult {
  thread: FlowThread;
  /** Kitchen actions to apply. Empty until a person approves. */
  effects: FlowAction[];
}

export type FlowErrorCode = "forbidden" | "invalid" | "stale" | "closed";

export class FlowError extends Error {
  constructor(
    readonly code: FlowErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FlowError";
  }
}

const human = (role: RoomRole): "chef" | "management" =>
  role === "management" ? "management" : "chef";

/** Who may answer a question: its addressee, or Management for anything the Chef could answer. */
export function canAnswer(
  role: RoomRole,
  question: FlowQuestion,
): { allowed: boolean; reason?: string } {
  if (role === "caregiver")
    return { allowed: false, reason: "Caregivers can follow along but can't answer." };
  if (role === "management") return { allowed: true };
  if (question.to === "management") return { allowed: false, reason: "This needs Management." };
  return { allowed: true };
}

/* ---------------------------------------------------------------- */
/* Internals                                                         */
/* ---------------------------------------------------------------- */

interface Run {
  state: KitchenState;
  thread: FlowThread;
  reference: Date;
  say: (
    from: RoomActor,
    to: RoomActor | "all",
    kind: RoomKind,
    tone: RoomEvent["tone"],
    text: string,
  ) => void;
  ctx: NarrationContext;
}

function makeRun(state: KitchenState, thread: FlowThread, reference: Date): Run {
  const say: Run["say"] = (from, to, kind, tone, text) => {
    thread.events.push({
      id: `${thread.id}-${thread.events.length + 1}`,
      from,
      to,
      kind,
      tone,
      text,
    });
  };
  return {
    state,
    thread,
    reference,
    say,
    ctx: { state, date: thread.date, meal: thread.meal, say },
  };
}

const YES_NO = (yes: string, stop: string): FlowOption[] => [
  { id: "yes", label: yes },
  { id: "another", label: "Show another option" },
  { id: "stop", label: stop },
];

function ask(run: Run, question: Omit<FlowQuestion, "id">): void {
  run.thread.questionCount += 1;
  run.thread.question = { ...question, id: `${run.thread.id}-q${run.thread.questionCount}` };
  run.thread.status = "awaiting";
}

function stop(run: Run, text: string): void {
  run.say("menu", human(run.thread.requestedBy), "decision", "info", text);
  run.thread.status = "stopped";
  delete run.thread.question;
  delete run.thread.plan;
}

/** The Menu Agent offers a dish and waits for an answer. */
function askToUse(run: Run, candidate: Evaluation, text: string): void {
  const to = human(run.thread.requestedBy);
  run.thread.tried.push(candidate.dish.id);
  delete run.thread.plan;
  run.say("menu", to, "approval-request", "info", text);
  ask(run, {
    to,
    from: "menu",
    kind: "propose",
    prompt: text,
    options: YES_NO("Yes, use it", "Stop"),
    dishId: candidate.dish.id,
  });
}

/** After the checks: swap if something can't be delivered, ask about unsafe residents, or ask for approval. */
function conclude(run: Run, current: Evaluation): void {
  const { state, thread, reference } = run;

  if (current.blocked.length) {
    const avoid = new Set(current.blocked.map((r) => r.ingredientId));
    const swap = chooseReplacement(state, thread.date, thread.meal, thread.tried, avoid, reference);
    if (!swap) {
      stop(
        run,
        `I couldn't find a ${thread.meal} dish that avoids the shortage, so I'm stopping here. The unavailable items need a decision outside the agents.`,
      );
      return;
    }
    askToUse(
      run,
      swap,
      `I'd swap ${current.dish.name} for ${swap.dish.name}: ${swapReason(state, swap, avoid)}. Shall I switch?`,
    );
    return;
  }

  if (current.uncovered.length) {
    const next = chooseReplacement(
      state,
      thread.date,
      thread.meal,
      thread.tried,
      new Set(),
      reference,
    );
    if (!next) {
      stop(
        run,
        `Some residents have no safe option and I'm out of dishes to try, so I'm stopping here.`,
      );
      return;
    }
    askToUse(
      run,
      next,
      `${current.dish.name} leaves some residents without a safe option. How about ${next.dish.name}? ${swapReason(state, next, new Set())}.`,
    );
    return;
  }

  const plan = buildPlan(state, thread.date, thread.meal, current);
  thread.plan = plan;
  const summary = [
    plan.dishName,
    plan.alternatives.length
      ? `${plural(
          plan.alternatives.reduce((n, a) => n + a.residentNames.length, 0),
          "resident",
        )} on safe alternatives`
      : "",
    plan.orders.length ? `a draft order of ${money(plan.orderTotal)}` : "",
  ].filter(Boolean);
  const text =
    plan.approver === "management"
      ? `Ready for approval: ${list(summary)}. The order is over ${money(MANAGEMENT_APPROVAL_THRESHOLD)}, so Management must approve it.`
      : `Ready for your approval: ${list(summary)}. ${plan.orders.length ? "Approve to save the menu and place the order." : "Approve to save and sign off the menu."}`;
  run.say("menu", plan.approver, "approval-request", "ok", text);
  ask(run, {
    to: plan.approver,
    from: "menu",
    kind: "approve",
    prompt: text,
    options: YES_NO("Approve", "Not now"),
    dishId: plan.dishId,
  });
}

/* ---------------------------------------------------------------- */
/* Starting and answering                                            */
/* ---------------------------------------------------------------- */

export function startFlow(
  state: KitchenState,
  req: { id: string; date: string; meal: Meal; by: RoomRole; reference?: Date },
): FlowResult {
  const reference = req.reference ?? new Date();
  const permission = can(req.by, "request-plan");
  if (!permission.allowed) throw new FlowError("forbidden", permission.reason ?? "Not allowed.");
  const offset = offsetOf(req.date, reference);
  if (offset < 1 || offset > 6)
    throw new FlowError("invalid", "Plans can be requested for tomorrow up to six days ahead.");

  const thread: FlowThread = {
    id: req.id,
    date: req.date,
    meal: req.meal,
    requestedBy: req.by,
    status: "awaiting",
    events: [],
    tried: [],
    questionCount: 0,
  };
  const run = makeRun(state, thread, reference);
  const when = dayLabel(req.date);
  const planned = dishById(resolveMenuState(state, offset, reference).plan[req.meal]);

  run.say(human(req.by), "menu", "request", "info", `Please plan ${req.meal} for ${when}.`);
  const current = evaluate(state, req.date, req.meal, planned.id, reference);
  thread.tried.push(planned.id);
  run.say(
    "menu",
    "dietary",
    "proposal",
    "info",
    `I'm proposing ${planned.name} for ${req.meal} on ${when}. Dietary, please check it against all ${state.residents.length} residents.`,
  );
  narrateDietary(run.ctx, current, false);
  run.say(
    "menu",
    "inventory",
    "proposal",
    "info",
    `Dietary-checked plan: ${planned.name}${current.covered.length ? ` plus ${plural(current.covered.length, "alternative dish", "alternative dishes")}` : ""}. Inventory, can you cover the ingredients by ${when}?`,
  );
  narrateInventory(run.ctx, current, false);
  conclude(run, current);
  return { thread, effects: [] };
}

export function answerFlow(
  state: KitchenState,
  previous: FlowThread,
  answer: { questionId: string; optionId: FlowOptionId; by: RoomRole },
  reference: Date = new Date(),
): FlowResult {
  const question = previous.question;
  if (previous.status !== "awaiting" || !question)
    throw new FlowError("closed", "This conversation is already finished.");
  if (question.id !== answer.questionId)
    throw new FlowError("stale", "That question was already answered.");
  const permission = canAnswer(answer.by, question);
  if (!permission.allowed) throw new FlowError("forbidden", permission.reason ?? "Not allowed.");
  if (!question.options.some((o) => o.id === answer.optionId))
    throw new FlowError("invalid", "That isn't one of the options.");

  // Work on a copy, so the caller's thread is never changed in place.
  const thread: FlowThread = structuredClone(previous);
  delete thread.question;
  const run = makeRun(state, thread, reference);
  const actor = human(answer.by);

  if (answer.optionId === "stop") {
    run.say(actor, "menu", "decision", "info", "Stop. Not now.");
    stop(run, "Okay, I'll stop here. Nothing was changed.");
    return { thread, effects: [] };
  }

  if (answer.optionId === "another") {
    run.say(actor, "menu", "decision", "info", "Show me another option.");
    const next = chooseReplacement(
      state,
      thread.date,
      thread.meal,
      thread.tried,
      new Set(),
      reference,
    );
    if (!next) {
      stop(
        run,
        `I'm out of safe options for ${thread.meal} on ${dayLabel(thread.date)}, so I'm stopping here.`,
      );
    } else {
      askToUse(
        run,
        next,
        `How about ${next.dish.name}? ${swapReason(state, next, new Set())}. Shall I use it?`,
      );
    }
    return { thread, effects: [] };
  }

  // "yes"
  if (question.kind === "propose") {
    run.say(actor, "menu", "decision", "ok", "Yes, switch to it.");
    const dish = dishById(question.dishId);
    run.say(
      "menu",
      "all",
      "proposal",
      "info",
      `Switching to ${dish.name}. Dietary and Inventory, please re-check.`,
    );
    const current = evaluate(state, thread.date, thread.meal, dish.id, reference);
    narrateDietary(run.ctx, current, true);
    narrateInventory(run.ctx, current, true);
    conclude(run, current);
    return { thread, effects: [] };
  }

  // Approving: re-check against the kitchen as it is now, because things may have changed while we waited.
  const fresh = buildPlan(
    state,
    thread.date,
    thread.meal,
    evaluate(state, thread.date, thread.meal, question.dishId, reference),
  );
  if (!fresh.ready) {
    run.say(actor, "menu", "decision", "ok", "Approved.");
    run.say(
      "menu",
      actor,
      "check",
      "alert",
      "Wait: things changed while we were deciding, so I need to re-check before I save anything.",
    );
    const current = evaluate(state, thread.date, thread.meal, question.dishId, reference);
    narrateDietary(run.ctx, current, true);
    narrateInventory(run.ctx, current, true);
    conclude(run, current);
    return { thread, effects: [] };
  }
  const approval = can(answer.by, "approve-plan", fresh);
  if (!approval.allowed) {
    run.say(actor, "menu", "decision", "ok", "Approved.");
    run.say(
      "menu",
      "management",
      "approval-request",
      "alert",
      `Prices or stock changed while we waited: the order is now ${money(fresh.orderTotal)}, over the ${money(MANAGEMENT_APPROVAL_THRESHOLD)} limit, so Management must approve it.`,
    );
    thread.plan = fresh;
    ask(run, {
      to: "management",
      from: "menu",
      kind: "approve",
      prompt: `Order is now ${money(fresh.orderTotal)}. ${ROLE_LABEL.management} approval needed.`,
      options: YES_NO("Approve", "Not now"),
      dishId: fresh.dishId,
    });
    return { thread, effects: [] };
  }

  run.say(actor, "all", "decision", "ok", "Approved.");
  run.say(
    "menu",
    actor,
    "decision",
    "ok",
    `Saved ${fresh.dishName} for ${fresh.meal} on ${dayLabel(fresh.date)} and signed it off.`,
  );
  if (fresh.orders.length) {
    run.say(
      "inventory",
      actor,
      "decision",
      "ok",
      `Placed ${plural(fresh.orders.length, "order")} (${money(fresh.orderTotal)}): ${list(fresh.orders.map((o) => `${o.vendorName}, arriving ${dayLabel(o.deliveryDate)}`))}.`,
    );
  }
  thread.plan = fresh;
  thread.status = "done";
  return { thread, effects: planActions(fresh) };
}
