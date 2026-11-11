import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessagesSquare, Play } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/kitchen/app-shell";
import {
  PlanCard,
  RoomMessage,
  TypingIndicator,
  type PlanStatus,
} from "@/components/kitchen/agent-room-view";
import { Button } from "@/components/ui/button";
import {
  dayLabel,
  decisionEvents,
  escalationEvents,
  planActions,
  runAgentRoom,
  type RoomEvent,
  type RoomThread,
} from "@/lib/kitchen/agent-room";
import { can, ROLE_LABEL, ROOM_ROLES, type RoomRole } from "@/lib/kitchen/agent-room-access";
import { dateKey, dayAt } from "@/lib/kitchen/schedule";
import { useKitchen } from "@/lib/kitchen/store";
import { MEALS, type Meal } from "@/lib/kitchen/types";

export const Route = createFileRoute("/agent-room")({
  head: () => ({
    meta: [
      { title: "Agent Room · NutriSync" },
      {
        name: "description",
        content:
          "Watch the Dietary, Menu and Inventory agents work together on a meal plan, hand problems to each other and ask a person to approve.",
      },
      { property: "og:title", content: "Agent Room · NutriSync" },
      {
        property: "og:description",
        content: "The three agents collaborate in the open, and people approve what they decide.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AgentRoomPage,
});

const ROLE_KEY = "agent-room-role";
const MEAL_LABEL: Record<Meal, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

/** The role is a demo switch, remembered per browser. Storage can be blocked, so it is always optional. */
function useRole(): [RoomRole, (role: RoomRole) => void] {
  const [role, setRole] = useState<RoomRole>("chef");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ROLE_KEY);
      if (saved === "chef" || saved === "caregiver" || saved === "management") setRole(saved);
    } catch {
      /* ignore */
    }
  }, []);
  return [
    role,
    (next) => {
      setRole(next);
      try {
        localStorage.setItem(ROLE_KEY, next);
      } catch {
        /* ignore */
      }
    },
  ];
}

function AgentRoomPage() {
  const { state, dispatch } = useKitchen();
  const [role, setRole] = useRole();
  const [date, setDate] = useState(() => dateKey(dayAt(1)));
  const [meal, setMeal] = useState<Meal>("lunch");
  const [log, setLog] = useState<RoomEvent[]>([]);
  const [shown, setShown] = useState(0);
  const [thread, setThread] = useState<RoomThread | null>(null);
  const [status, setStatus] = useState<PlanStatus>("open");
  const [runs, setRuns] = useState(0);
  const [instant, setInstant] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const dates = useMemo(() => Array.from({ length: 6 }, (_, i) => dateKey(dayAt(i + 1))), []);
  const done = thread !== null && shown >= log.length;

  // Reveal the conversation one line at a time, so people can follow who says what.
  useEffect(() => {
    if (shown >= log.length) return;
    const timer = window.setTimeout(
      () => setShown((n) => n + 1),
      instant ? 0 : shown === 0 ? 500 : 1200,
    );
    return () => window.clearTimeout(timer);
  }, [shown, log.length, instant]);
  useEffect(() => {
    bottom.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [shown, status]);

  function ask(exclude: string[] = []) {
    const run = runs + 1;
    const next = runAgentRoom(state, {
      date,
      meal,
      reference: new Date(),
      exclude,
      id: `room-${date}-${meal}-r${run}`,
    });
    setRuns(run);
    setThread(next);
    setStatus("open");
    if (exclude.length) {
      setLog((l) => [...l, ...next.events]);
    } else {
      setLog(next.events);
      setShown(0);
    }
  }

  function approve() {
    if (!thread || !can(role, "approve-plan", thread.plan).allowed) return;
    for (const action of planActions(thread.plan)) dispatch(action);
    const by = role === "management" ? "management" : "chef";
    setLog((l) => [...l, ...decisionEvents(thread, "approved", by, l.length)]);
    setInstant(true);
    setStatus("approved");
    toast.success(
      `Saved ${thread.plan.dishName} for ${thread.plan.meal} on ${dayLabel(thread.plan.date)}`,
    );
  }

  function sendToManagement() {
    if (!thread || !can(role, "send-to-management", thread.plan).allowed) return;
    setLog((l) => [...l, ...escalationEvents(thread, l.length)]);
    setStatus("escalated");
  }

  const requester = can(role, "request-plan");
  const next = shown < log.length ? log[shown] : undefined;

  return (
    <>
      <PageHeader eyebrow="Agents at work" title="Agent Room">
        <div className="flex items-center gap-2" role="group" aria-label="Viewing as">
          <span className="text-sm text-muted-foreground">Viewing as</span>
          {ROOM_ROLES.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={role === r ? "default" : "outline"}
              aria-pressed={role === r}
              onClick={() => setRole(r)}
            >
              {ROLE_LABEL[r]}
            </Button>
          ))}
        </div>
      </PageHeader>

      <section
        className="mb-6 rounded-xl border bg-card p-5 shadow-soft"
        aria-label="Ask the agents"
      >
        <div className="mb-3 text-sm font-semibold">What should the agents plan?</div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Day">
            {dates.map((d) => (
              <Button
                key={d}
                size="sm"
                variant={date === d ? "default" : "outline"}
                aria-pressed={date === d}
                onClick={() => setDate(d)}
              >
                {dayLabel(d)}
              </Button>
            ))}
          </div>
          <div className="flex gap-1" role="group" aria-label="Meal">
            {MEALS.map((m) => (
              <Button
                key={m}
                size="sm"
                variant={meal === m ? "default" : "outline"}
                aria-pressed={meal === m}
                onClick={() => setMeal(m)}
              >
                {MEAL_LABEL[m]}
              </Button>
            ))}
          </div>
          <Button onClick={() => ask()} disabled={!requester.allowed} title={requester.reason}>
            <Play /> Ask the agents
          </Button>
        </div>
        {!requester.allowed && (
          <p className="mt-3 text-sm text-muted-foreground">{requester.reason}</p>
        )}
      </section>

      {!thread ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          <MessagesSquare className="h-8 w-8" />
          <p className="max-w-md text-sm">
            Pick a day and a meal, then ask the agents. You'll watch the Menu, Dietary and Inventory
            agents check each other's work, hand problems back and forth, and ask a person to
            approve.
          </p>
        </div>
      ) : (
        <div className="space-y-4" aria-label="Conversation">
          {log.slice(0, shown).map((event) => (
            <RoomMessage key={event.id} event={event} />
          ))}
          {next && <TypingIndicator actor={next.from} />}
          {!done && (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setInstant(true)}>
                Show everything now
              </Button>
            </div>
          )}
          {done && (
            <PlanCard
              plan={thread.plan}
              role={role}
              status={status}
              onApprove={approve}
              onSendToManagement={sendToManagement}
              onAnother={() => ask(thread.tried)}
            />
          )}
          <div ref={bottom} />
        </div>
      )}
    </>
  );
}
