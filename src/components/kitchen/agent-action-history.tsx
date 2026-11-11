import { useState } from "react";
import { agentActionHistory } from "@/lib/kitchen/agent-workflow";
import { useKitchen } from "@/lib/kitchen/store";
import { parseDateKey } from "@/lib/kitchen/weekly-schedule";
import type { AgentId } from "@/lib/kitchen/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MEAL_LABEL } from "./agents";
import { ACTION_LABEL, HANDOFF_STYLE, PARTY_LABEL } from "./agent-workspace";

export const ACTION_HISTORY_PAGE_SIZE = 15;

const stamp = (ms: number) =>
  new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const serviceDay = (date: string) =>
  parseDateKey(date)?.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) ?? date;

/** Read-only log of the actions this agent took in weekly workflow runs, newest first. */
export function AgentActionHistory({ agent }: { agent: AgentId }) {
  const { state } = useKitchen();
  const [visible, setVisible] = useState(ACTION_HISTORY_PAGE_SIZE);
  const actions = agentActionHistory(state, agent);
  const shown = actions.slice(0, visible);
  const remaining = actions.length - shown.length;

  return (
    <section className="mt-8 max-w-5xl border-t pt-6" aria-labelledby="agent-action-history">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="agent-action-history" className="font-display text-xl font-semibold">Action history</h2>
        {actions.length > 0 && (
          <p className="text-sm text-muted-foreground">Showing {shown.length} of {actions.length}</p>
        )}
      </div>
      {!actions.length ? (
        <p className="border-y py-6 text-sm text-muted-foreground">
          No recorded actions yet. Actions appear here once a weekly workflow runs in the Agent Workspace.
        </p>
      ) : (
        <>
          <ol className="divide-y rounded-xl border bg-card shadow-soft">
            {shown.map((e) => {
              const style = HANDOFF_STYLE[e.status];
              const Icon = style.icon;
              return (
                <li key={e.eventId} className="flex flex-col gap-1.5 p-4 sm:flex-row sm:gap-4">
                  <time dateTime={new Date(e.timestamp).toISOString()} className="shrink-0 text-xs text-muted-foreground sm:w-40 sm:pt-0.5">
                    {stamp(e.timestamp)}
                  </time>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold">{ACTION_LABEL[e.action]}</span>
                      <span className="text-xs text-muted-foreground">→ {PARTY_LABEL[e.receivingAgent]}</span>
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", style.badge)}>
                        <Icon className="h-3 w-3" aria-hidden />
                        {style.label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">{e.summary}</p>
                    {e.result && <p className="mt-0.5 text-sm text-muted-foreground">{e.result}</p>}
                    {e.affectedDate && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {serviceDay(e.affectedDate)}{e.affectedMeal ? ` · ${MEAL_LABEL[e.affectedMeal]}` : ""}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {remaining > 0 && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" onClick={() => setVisible((v) => v + ACTION_HISTORY_PAGE_SIZE)}>
                Load {Math.min(remaining, ACTION_HISTORY_PAGE_SIZE)} more
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
