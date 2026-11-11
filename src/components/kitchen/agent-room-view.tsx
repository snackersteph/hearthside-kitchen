import { Check, Send } from "lucide-react";
import { AGENTS, AgentAvatar, Tag } from "@/components/kitchen/agents";
import { Button } from "@/components/ui/button";
import { dayLabel, type RoomActor, type RoomEvent, type RoomPlan } from "@/lib/kitchen/agent-room";
import { can, ROLE_LABEL, type RoomRole } from "@/lib/kitchen/agent-room-access";
import type { AgentId } from "@/lib/kitchen/types";
import { cn } from "@/lib/utils";

const isAgent = (actor: RoomActor | "all"): actor is AgentId =>
  actor === "dietary" || actor === "menu" || actor === "inventory";
export const actorName = (actor: RoomActor | "all") =>
  actor === "all"
    ? "everyone"
    : isAgent(actor)
      ? AGENTS[actor].name
      : actor === "chef"
        ? "Chef"
        : "Management";

const TONE = {
  info: "border-border bg-card",
  alert: "border-warning bg-warning-soft",
  ok: "border-success bg-success-soft",
} as const;

/** One line of the conversation. People are on the right, agents on the left. */
export function RoomMessage({ event }: { event: RoomEvent }) {
  const human = !isAgent(event.from);
  return (
    <div
      className={cn("flex items-end gap-3", human && "flex-row-reverse")}
      data-testid="room-message"
      data-from={event.from}
    >
      <AgentAvatar agent={isAgent(event.from) ? event.from : "staff"} />
      <div
        className={cn(
          "max-w-[min(42rem,85%)] rounded-2xl border px-4 py-3 text-sm shadow-soft",
          human ? "border-primary bg-primary text-primary-foreground" : TONE[event.tone],
        )}
      >
        <div
          className={cn(
            "mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold",
            human
              ? "text-primary-foreground/80"
              : isAgent(event.from)
                ? AGENTS[event.from].text
                : "",
          )}
        >
          <span>{actorName(event.from)}</span>
          <span className="font-normal opacity-70">to {actorName(event.to)}</span>
          {event.kind === "handoff" && <Tag tone="warn">Handoff</Tag>}
          {event.kind === "approval-request" && <Tag>Needs approval</Tag>}
        </div>
        <p className="leading-relaxed">{event.text}</p>
      </div>
    </div>
  );
}

export function TypingIndicator({ actor }: { actor: RoomActor }) {
  return (
    <div
      className={cn("flex items-end gap-3", !isAgent(actor) && "flex-row-reverse")}
      data-testid="typing-indicator"
    >
      <AgentAvatar agent={isAgent(actor) ? actor : "staff"} />
      <div
        className="rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground shadow-soft"
        aria-live="polite"
      >
        {actorName(actor)} is working
        <span className="ml-1 inline-flex gap-0.5" aria-hidden>
          <span className="animate-pulse">.</span>
          <span className="animate-pulse [animation-delay:150ms]">.</span>
          <span className="animate-pulse [animation-delay:300ms]">.</span>
        </span>
      </div>
    </div>
  );
}

export type PlanStatus = "open" | "escalated" | "approved";

/** The plan the agents agreed on, with the buttons each role is allowed to press. */
export function PlanCard({
  plan,
  role,
  status,
  onApprove,
  onSendToManagement,
  onAnother,
}: {
  plan: RoomPlan;
  role: RoomRole;
  status: PlanStatus;
  onApprove: () => void;
  onSendToManagement: () => void;
  onAnother: () => void;
}) {
  const approve = can(role, "approve-plan", plan);
  const send = can(role, "send-to-management", plan);
  const another = can(role, "request-plan");
  const needsManagement = plan.approver === "management";
  const money = (n: number) => `$${n.toFixed(2)}`;
  // Why the primary button is off, shown in words next to it.
  const blockedReason = status === "open" && !approve.allowed ? approve.reason : undefined;

  return (
    <section
      className="rounded-xl border bg-card p-5 shadow-soft"
      aria-label="Plan for approval"
      data-testid="plan-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {plan.meal} · {dayLabel(plan.date)}
          </div>
          <h3 className="mt-1 text-xl font-semibold">{plan.dishName}</h3>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {needsManagement && <Tag tone="warn">Needs Management</Tag>}
          {!plan.ready && <Tag tone="danger">Needs a decision</Tag>}
          {status === "approved" && <Tag tone="ok">Approved and saved</Tag>}
          {status === "escalated" && <Tag>Waiting for Management</Tag>}
        </div>
      </div>

      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-semibold">Safe alternatives</h4>
          {plan.alternatives.length ? (
            <ul className="space-y-1.5 text-sm">
              {plan.alternatives.map((a) => (
                <li key={a.dishId}>
                  <span className="font-medium">{a.dishName}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {a.residentNames.map((n) => n.split(" ")[0]).join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Everyone can eat the main dish.</p>
          )}
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold">Draft orders</h4>
          {plan.orders.length ? (
            <ul className="space-y-1.5 text-sm">
              {plan.orders.map((o) => (
                <li key={o.id}>
                  <span className="font-medium">{o.vendorName}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {money(o.total)} · arrives {dayLabel(o.deliveryDate)}
                  </span>
                </li>
              ))}
              <li className="pt-1 font-semibold">Total {money(plan.orderTotal)}</li>
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing to order. Stock covers this meal.
            </p>
          )}
        </div>
      </div>

      {(plan.unresolved.length > 0 || plan.blocked.length > 0) && (
        <div className="mt-4 border-l-4 border-destructive bg-danger-soft p-3 text-sm">
          {plan.unresolved.length > 0 && (
            <div>
              No safe option on file for {plan.unresolved.map((n) => n.split(" ")[0]).join(", ")}.
            </div>
          )}
          {plan.blocked.map((b) => (
            <div key={b.ingredientId}>
              {b.name} can't arrive in time: {b.reason}.
            </div>
          ))}
        </div>
      )}

      {status !== "approved" && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {status === "open" && needsManagement && role === "chef" ? (
            <Button onClick={onSendToManagement} disabled={!send.allowed} title={send.reason}>
              <Send /> Send to Management
            </Button>
          ) : status === "escalated" && role === "chef" ? (
            <Button disabled>
              <Send /> Sent to Management
            </Button>
          ) : (
            <Button onClick={onApprove} disabled={!approve.allowed} title={approve.reason}>
              <Check /> {role === "management" ? "Approve as Management" : "Approve"}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={onAnother}
            disabled={!another.allowed}
            title={another.reason}
          >
            Show another option
          </Button>
          {blockedReason && (
            <p className="basis-full text-sm text-muted-foreground">{blockedReason}</p>
          )}
          {status === "escalated" && role === "chef" && (
            <p className="basis-full text-sm text-muted-foreground">
              Sent. Switch to {ROLE_LABEL.management} to approve it.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
