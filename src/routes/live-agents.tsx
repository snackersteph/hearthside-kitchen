import { createFileRoute, Link } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PageHeader } from "@/components/kitchen/app-shell";
import { TelegramPhone } from "@/components/kitchen/telegram-phone";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL } from "@/lib/kitchen/agent-room-access";
import { reducer, useKitchen } from "@/lib/kitchen/store";
import { DEMO_USERS, hasHidden, TelegramSimulation } from "@/lib/kitchen/telegram-sim";

export const Route = createFileRoute("/live-agents")({
  head: () => ({
    meta: [
      { title: "Live Agents · NutriSync" },
      {
        name: "description",
        content:
          "Talk to the Menu, Dietary and Inventory agents from three phones. They ask questions, wait for answers and change the kitchen when approved.",
      },
      { property: "og:title", content: "Live Agents · NutriSync" },
      {
        property: "og:description",
        content: "Real two-way interaction between people and the kitchen agents.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LiveAgentsPage,
});

const SUGGESTIONS: Record<string, string[]> = {
  chef: ["/plan lunch tomorrow", "/plan dinner in 2 days", "/plan tomorrow"],
  management: ["/plan lunch tomorrow", "/plan dinner in 2 days"],
  caregiver: ["/plan lunch tomorrow", "/help"],
};

function LiveAgentsPage() {
  const { state, dispatch } = useKitchen();
  // The phones always read the kitchen as it is right now, and change the real kitchen when something is approved.
  const stateRef = useRef(state);
  stateRef.current = state;
  const [sim] = useState(
    () =>
      new TelegramSimulation(
        () => stateRef.current,
        (actions) => {
          for (const action of actions) {
            stateRef.current = reducer(stateRef.current, action, new Date());
            dispatch(action);
          }
        },
      ),
  );
  const chats = useSyncExternalStore(sim.subscribe, sim.snapshot, sim.snapshot);
  const joined = useRef(false);
  // The "what changed" card only lists decisions made from the phones since the page opened (or Start over).
  const [since, setSince] = useState(() => Date.now());

  useEffect(() => {
    if (joined.current) return;
    joined.current = true;
    void sim.join();
  }, [sim]);

  // Reveal the agents' messages one at a time on every phone.
  useEffect(() => {
    if (!hasHidden(chats)) return;
    const timer = window.setTimeout(() => sim.reveal(), 650);
    return () => window.clearTimeout(timer);
  }, [chats, sim]);

  const incoming = (state.orders ?? []).filter((o) => o.status === "incoming").length;
  const changes = state.history.filter((h) => h.at >= since);

  return (
    <>
      <PageHeader eyebrow="Telegram, simulated" title="Live Agents">
        <Button
          variant="outline"
          onClick={() => {
            sim.reset();
            setSince(Date.now());
            void sim.join();
          }}
        >
          <RotateCcw /> Start over
        </Button>
      </PageHeader>

      <section
        className="mb-6 rounded-xl border bg-card p-5 text-sm shadow-soft"
        aria-label="How to try this"
      >
        <div className="mb-2 font-semibold">How to try it</div>
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>
            On <b className="text-foreground">Chris's phone</b> (Chef) tap{" "}
            <i>/plan lunch tomorrow</i>. The agents work it out, and when Inventory can't get an
            ingredient in time, the Menu Agent <b className="text-foreground">asks Chris</b> whether
            to swap the dish.
          </li>
          <li>
            Tap the buttons under the question. The agents re-check and ask again. Approving really
            changes the kitchen.
          </li>
          <li>
            Try <i>/plan dinner in 2 days</i>: the order is over $200, so Chris's phone says it is
            waiting and <b className="text-foreground">Morgan's phone</b> (Management) gets the
            Approve button.
          </li>
          <li>
            <b className="text-foreground">Casey</b> (Caregiver) sees everything but can't ask or
            answer.
          </li>
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          These phones pretend to be Telegram. The agents, the questions, the roles and the kitchen
          changes are the real thing, and a real Telegram bot will use exactly the same code.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {DEMO_USERS.map((u) => (
          <TelegramPhone
            key={u.id}
            name={u.name}
            roleLabel={ROLE_LABEL[u.role]}
            messages={chats[u.id] ?? []}
            suggestions={SUGGESTIONS[u.role] ?? []}
            onSend={(text) => void sim.say(u.id, text)}
            onPress={(message, button) => {
              if (message.messageId !== undefined)
                void sim.press(u.id, message.messageId, message.text, button.data);
            }}
          />
        ))}
      </div>

      <section
        className="mt-6 rounded-xl border bg-card p-5 shadow-soft"
        aria-label="What changed in the kitchen"
      >
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">What changed in the kitchen</h2>
          <div className="flex gap-4 text-sm">
            <Link to="/approvals" className="font-medium underline underline-offset-4">
              Approval Center
            </Link>
            <Link
              to="/inventory"
              search={{ view: "incoming" }}
              className="font-medium underline underline-offset-4"
            >
              Incoming orders ({incoming})
            </Link>
          </div>
        </div>
        {changes.length ? (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {changes.slice(0, 5).map((h, i) => (
              <li key={`${h.proposalId}-${i}`}>{h.summary}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing yet. Approve a plan on a phone and it shows up here.
          </p>
        )}
      </section>
    </>
  );
}
