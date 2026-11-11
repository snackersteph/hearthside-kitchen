import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert,
  ClipboardCheck, Clock, Minus, Sparkles, TriangleAlert, UserCheck, type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/kitchen/app-shell";
import { AgentAvatar } from "@/components/kitchen/agents";
import { useKitchen } from "@/lib/kitchen/store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  AGENT_INFO, AGENT_ORDER, GEN_STEPS, HANDOFFS, MEAL_NAMES, MEAL_ROWS, STAGE_REVEAL_STEP, STAGES,
  SUBSTITUTIONS, TOTAL_MEALS, TOTAL_RESIDENTS, WEEK_DAYS, agentActivity, cellStatus, summaryCounts,
  weekRangeLabel, type AgentActivity, type AgentId, type CellStatus, type Handoff, type HandoffStatus,
  type SubstitutionId, type WeeklyStatus, type WorkspaceState,
} from "@/lib/kitchen/weekly-plan";

const HANDOFF_STYLE: Record<HandoffStatus, { icon: LucideIcon; label: string; badge: string }> = {
  completed: { icon: CheckCircle2, label: "Completed", badge: "bg-success-soft text-success" },
  warning: { icon: TriangleAlert, label: "Warning", badge: "bg-warning-soft text-warning" },
  pending: { icon: Clock, label: "Pending", badge: "bg-muted text-muted-foreground" },
};

const ACTIVITY_LABEL: Record<AgentActivity, { label: string; badge: string }> = {
  idle: { label: "Idle", badge: "bg-muted text-muted-foreground" },
  working: { label: "Working", badge: "bg-accent text-accent-foreground" },
  "waiting-agent": { label: "Waiting on another agent", badge: "bg-accent text-accent-foreground" },
  "waiting-manager": { label: "Waiting on Manager", badge: "bg-warning-soft text-warning" },
  completed: { label: "Completed", badge: "bg-success-soft text-success" },
  blocked: { label: "Blocked", badge: "bg-destructive/10 text-destructive" },
};

const WEEKLY_STATUS_LABEL: Record<WeeklyStatus, string> = {
  "not-started": "Not Started",
  generating: "Generating",
  "needs-review": "Needs Review",
  approved: "Approved",
};

const CELL_STYLE: Record<CellStatus, string> = {
  unplanned: "bg-muted text-muted-foreground",
  passed: "bg-success-soft text-success",
  review: "bg-warning-soft text-warning",
  approved: "bg-success text-success-foreground",
};

const CELL_ICON: Record<CellStatus, LucideIcon> = {
  unplanned: Minus,
  passed: Check,
  review: TriangleAlert,
  approved: CheckCircle2,
};

export function AgentWorkspace({
  ws,
  onGenerate,
  onWeekChange,
  onApproveDecision,
  onRequestAnother,
  onApproveWeekly,
}: {
  ws: WorkspaceState;
  onGenerate: () => void;
  onWeekChange: (offset: number) => void;
  onApproveDecision: (id: SubstitutionId) => void;
  onRequestAnother: (id: SubstitutionId) => void;
  onApproveWeekly: () => void;
}) {
  const [selectedHandoff, setSelectedHandoff] = useState<string>("h3");
  const [selectedCell, setSelectedCell] = useState<{ day: number; meal: number } | null>(null);
  const { analysis } = useKitchen();
  const dietaryResidentCount = new Set(analysis.conflicts.map((conflict) => conflict.residentId)).size;
  const menuOpenItemCount = analysis.proposals.filter((proposal) => proposal.kind === "substitution").length + (analysis.mealReviews ?? []).filter((review) => !review.approved).length;
  const inventoryOpenItemCount = analysis.proposals.filter((proposal) => proposal.kind === "purchase").length;
  const agentSummaries: Record<AgentId, string> = {
    dietary: `Found ${dietaryResidentCount} residents with meal dietary conflicts in today’s menu`,
    menu: `Found ${menuOpenItemCount} open items across upcoming meal plans and substitutions`,
    inventory: `Found ${inventoryOpenItemCount} open purchase requests for upcoming ingredients`,
  };

  const scenarioWeek = ws.weekOffset === 0;
  const planned = ws.status !== "not-started" && scenarioWeek;
  const counts = summaryCounts(ws);
  const activities = agentActivity(ws.genStep, ws.status);
  const handoff = HANDOFFS.find((h) => h.id === selectedHandoff) ?? HANDOFFS[2]!;
  const pendingDecisions = SUBSTITUTIONS.filter((s) => ws.decisions[s.id].state !== "approved");
  const allDecided = pendingDecisions.length === 0;
  const currentStep = ws.status === "not-started" ? 0 : ws.status === "generating" ? 1 : ws.status === "needs-review" ? 2 : 4;

  return (
    <>
      <PageHeader eyebrow="Agents" title="Agent Workspace" />
      <p className="-mt-4 mb-6 text-muted-foreground">See how your AI team collaborates to plan meals for the week.</p>

      {/* Weekly planning controls */}
      <section aria-label="Weekly planning controls" className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4 shadow-soft">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Previous week" onClick={() => onWeekChange(ws.weekOffset - 1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <div className="min-w-52 text-center">
            <p className="font-semibold">{weekRangeLabel(ws.weekOffset)}</p>
            <p className="text-xs text-muted-foreground">Planning week · {WEEKLY_STATUS_LABEL[ws.status]}</p>
          </div>
          <Button variant="outline" size="icon" aria-label="Next week" onClick={() => onWeekChange(ws.weekOffset + 1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("rounded-full px-3 py-1 text-xs font-semibold",
            ws.status === "approved" ? "bg-success-soft text-success"
            : ws.status === "needs-review" ? "bg-warning-soft text-warning"
            : ws.status === "generating" ? "bg-accent text-accent-foreground"
            : "bg-muted text-muted-foreground")}>
            {WEEKLY_STATUS_LABEL[ws.status]}
          </span>
          <Button onClick={onGenerate} disabled={ws.status === "generating" || !scenarioWeek}>
            <Sparkles className="size-4" />
            {ws.status === "generating" ? `Generating… step ${ws.genStep} of ${GEN_STEPS}` : "Generate Weekly Plan"}
          </Button>
        </div>
      </section>

      {!scenarioWeek && (
        <p className="mb-8 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          This prototype includes one simulated planning scenario, for the week of November 16–22, 2026.
          Use the arrows to return to that week and generate its plan.
        </p>
      )}

      {/* Summary cards */}
      <section aria-label="Weekly summary" className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Meals Planned" value={`${counts.planned} / ${TOTAL_MEALS}`} sub="Breakfast, lunch, dinner × 7 days" />
        <SummaryCard label="Residents Covered" value={`${counts.residents} / ${TOTAL_RESIDENTS}`} sub="Resident meal assignments included" />
        <SummaryCard label="Issues Identified" value={String(counts.issues)} sub={counts.resolved ? `${counts.resolved} resolved · ${counts.issues - counts.resolved} unresolved` : "Dietary or inventory conflicts"} tone={counts.issues - counts.resolved > 0 ? "warn" : "ok"} />
        <SummaryCard label="Pending Approvals" value={String(counts.pending)} sub="Manager decisions required" tone={counts.pending > 0 ? "warn" : "ok"} />
      </section>

      {/* Agent overview */}
      <section aria-label="AI team overview" className="mb-8 grid gap-3 md:grid-cols-3">
        {AGENT_ORDER.map((id) => (
          <AgentCard key={id} id={id} activity={activities[id]} started={planned || ws.status === "generating"} summary={agentSummaries[id]} />
        ))}
      </section>

      {/* Weekly meal coverage matrix */}
      <section aria-label="Weekly meal coverage" className="mb-8 rounded-xl border bg-card p-5 shadow-soft">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Weekly meal coverage</h2>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-muted" />Not planned</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-success-soft" />Checks passed</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-warning-soft" />Needs review</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-success" />Approved</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="p-1 text-left text-xs font-medium text-muted-foreground">Meal</th>
                {WEEK_DAYS.map((d) => <th key={d} className="p-1 text-center text-xs font-medium text-muted-foreground">{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {MEAL_ROWS.map((meal, mealIdx) => (
                <tr key={meal}>
                  <th className="p-1 text-left text-xs font-semibold">{meal}</th>
                  {WEEK_DAYS.map((_, dayIdx) => {
                    const status = cellStatus(ws, dayIdx, mealIdx);
                    const Icon = CELL_ICON[status];
                    return (
                      <td key={dayIdx} className="p-1">
                        <button
                          type="button"
                          onClick={() => setSelectedCell({ day: dayIdx, meal: mealIdx })}
                          aria-label={`${WEEK_DAYS[dayIdx]} ${meal}: ${status}`}
                          className={cn("flex h-9 w-full items-center justify-center rounded-md transition-transform hover:scale-105", CELL_STYLE[status])}>
                          <Icon className="size-4" />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Main workspace: collaboration flow + handoff details */}
      <div className="mb-8 grid gap-6 lg:grid-cols-[65fr_35fr]">
        <section aria-label="Collaboration flow">
          <h2 className="mb-4 text-lg font-semibold">Collaboration Flow</h2>
          {!planned && ws.status !== "generating" ? (
            <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              No collaboration yet. Generate the weekly plan to watch the agents work through five stages,
              from dietary analysis to your approval.
            </p>
          ) : (
            <ol className="space-y-4">
              {STAGES.map((stage, i) => {
                const revealed = ws.genStep >= (STAGE_REVEAL_STEP[i] ?? 99);
                if (!revealed) return null;
                const style = HANDOFF_STYLE[stage.status];
                return (
                  <li key={stage.id} className="rounded-xl border bg-card p-5 shadow-soft">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold">Stage {stage.id} — {stage.title}</h3>
                      <span className={cn("flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", style.badge)}>
                        <style.icon className="size-3.5" />{stage.statusLabel}
                      </span>
                    </div>
                    <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{stage.agents}</p>
                    <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {stage.bullets.map((b) => <li key={b}>{b}</li>)}
                    </ul>
                    <div className="space-y-2">
                      {stage.handoffIds.map((hid) => {
                        const h = HANDOFFS.find((x) => x.id === hid)!;
                        const hs = HANDOFF_STYLE[h.status];
                        const active = selectedHandoff === h.id;
                        return (
                          <button key={h.id} type="button" onClick={() => setSelectedHandoff(h.id)}
                            className={cn("w-full rounded-lg border p-3 text-left transition-colors hover:border-primary",
                              active && "border-primary ring-1 ring-primary")}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1.5 text-xs font-semibold">
                                {h.from} <ArrowRight className="size-3 text-muted-foreground" /> {h.to}
                              </span>
                              <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", hs.badge)}>
                                <hs.icon className="size-3" />{hs.label}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{h.summary}</p>
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-3 text-sm"><span className="font-medium">Outcome:</span> <span className="text-muted-foreground">{stage.outcome}</span></p>
                  </li>
                );
              })}
              {ws.status === "generating" && (
                <li className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  <Clock className="size-4 animate-pulse" /> Agents are working…
                </li>
              )}
            </ol>
          )}
        </section>

        <aside aria-label="Handoff details and manager decisions" className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          {planned && pendingDecisions.length > 0 && (
            <section aria-label="Manager decisions" className="rounded-xl border border-warning bg-card p-5 shadow-soft">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                <UserCheck className="size-5 text-warning" />Manager Decisions
              </h2>
              <div className="space-y-4">
                {pendingDecisions.map((sub) => {
                  const d = ws.decisions[sub.id];
                  return (
                    <div key={sub.id} className="rounded-lg border p-4">
                      <p className="font-semibold">{sub.mealLabel} — Substitution Requested</p>
                      <dl className="mt-2 space-y-1 text-sm">
                        <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">Original</dt><dd>{sub.original}</dd></div>
                        <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">Proposed</dt><dd className="font-medium">{sub.proposals[d.proposalIndex]}</dd></div>
                        <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">Reason</dt><dd className="text-muted-foreground">{sub.reason}</dd></div>
                      </dl>
                      <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                        <li className="flex items-center gap-1"><Check className="size-3 text-success" />Known dietary checks passed</li>
                        <li className="flex items-center gap-1"><Check className="size-3 text-success" />Inventory check passed</li>
                        <li className="flex items-center gap-1"><CircleAlert className="size-3 text-warning" />Staff review required</li>
                      </ul>
                      {d.state === "revalidating" ? (
                        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="size-4 animate-pulse" />Menu Agent is proposing another option…
                        </p>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => onApproveDecision(sub.id)}>Approve Substitution</Button>
                          <Button size="sm" variant="outline" onClick={() => onRequestAnother(sub.id)}>Request Another Option</Button>
                          <Button size="sm" variant="ghost" asChild>
                            <Link to="/menu/$date" params={{ date: sub.date }} search={{ meal: "lunch", focus: true }}>View Meal Details</Link>
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section aria-label="Handoff details" className="rounded-xl border bg-card p-5 shadow-soft">
            <h2 className="mb-3 text-lg font-semibold">Handoff Details</h2>
            {planned || ws.status === "generating" ? (
              <HandoffDetails handoff={handoff} />
            ) : (
              <p className="text-sm text-muted-foreground">Select a handoff in the collaboration flow to inspect what the agents exchanged.</p>
            )}
          </section>
        </aside>
      </div>

      {/* Final weekly approval */}
      {planned && (
        <section aria-label="Weekly approval" className={cn("rounded-xl border p-5 shadow-soft", ws.status === "approved" ? "border-success bg-success-soft/40" : "bg-card")}>
          {ws.status === "approved" ? (
            <>
              <h2 className="flex items-center gap-2 text-lg font-semibold"><CheckCircle2 className="size-5 text-success" />Weekly Menu Approved</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The finalized 21-meal plan for {weekRangeLabel(ws.weekOffset)} is recorded, with your approval of both substitutions.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border bg-card p-4">
                  <h3 className="mb-1 text-sm font-semibold">Preparation summary</h3>
                  <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                    <li>21 meals across 7 days, all checks passed</li>
                    <li>12 residents covered, including 2 dairy-free and 1 soft-texture alternative set</li>
                    <li>Wednesday lunch: Lentil and Vegetable Bowl (substituted)</li>
                    <li>Friday lunch: Creamy Vegetable Pasta (substituted)</li>
                  </ul>
                </div>
                <div className="rounded-lg border bg-card p-4">
                  <h3 className="mb-1 text-sm font-semibold">Draft purchasing list</h3>
                  <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                    <li>Red lentils — 3 kg</li>
                    <li>Pasta — 2 kg</li>
                    <li>Seasonal vegetables — 6 kg</li>
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">Simulated draft only — no order has been placed.</p>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Final weekly approval</h2>
                <p className="text-sm text-muted-foreground">
                  {allDecided
                    ? "All checks passed and every substitution is decided. The week is ready for final approval."
                    : `Resolve the ${pendingDecisions.length} pending substitution${pendingDecisions.length > 1 ? "s" : ""} above before approving the week.`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">A passed automated check does not replace required clinical or professional review of therapeutic diets.</p>
              </div>
              <Button size="lg" disabled={!allDecided} onClick={onApproveWeekly}>
                <ClipboardCheck className="size-4" />Approve Weekly Menu
              </Button>
            </div>
          )}
        </section>
      )}

      {/* Meal cell details */}
      <Dialog open={selectedCell !== null} onOpenChange={(open) => !open && setSelectedCell(null)}>
        <DialogContent className="max-w-md">
          {selectedCell && (
            <MealCellDetails ws={ws} day={selectedCell.day} meal={selectedCell.meal} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function SummaryCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-soft">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold", tone === "warn" && "text-warning", tone === "ok" && "text-success")}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function AgentCard({ id, activity, started, summary }: { id: AgentId; activity: AgentActivity; started: boolean; summary: string }) {
  const info = AGENT_INFO[id];
  const a = ACTIVITY_LABEL[activity];
  return (
    <article className="rounded-xl border bg-card p-5 shadow-soft">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold">
          <AgentAvatar agent={id} />
          {info.name}
        </span>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", a.badge)}>{a.label}</span>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">{summary}</p>
      {started ? (
        <div className="rounded-lg bg-muted/60 p-3">
          <p className="text-sm font-medium">{activity === "idle" ? "Waiting to start" : info.statusTitle}</p>
          {activity !== "idle" && <p className="mt-0.5 text-xs text-muted-foreground">{info.statusDetail}</p>}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Idle until the weekly plan is generated.</p>
      )}
    </article>
  );
}

function HandoffDetails({ handoff }: { handoff: Handoff }) {
  const style = HANDOFF_STYLE[handoff.status];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          {handoff.from} <ArrowRight className="size-3.5 text-muted-foreground" /> {handoff.to}
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold", style.badge)}>
            <style.icon className="size-3" />{style.label}
          </span>
          <time>{handoff.time}</time>
        </span>
      </div>
      <div className="space-y-3 text-sm">
        <div>
          <h3 className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reason for handoff</h3>
          <p>{handoff.reason}</p>
        </div>
        <div>
          <h3 className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Information shared</h3>
          <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
            {handoff.shared.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </div>
        <div>
          <h3 className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agent response</h3>
          <p>{handoff.response}</p>
        </div>
        <div>
          <h3 className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Impact on weekly plan</h3>
          <p>{handoff.impact}</p>
        </div>
        {handoff.affectedMeal && (
          <Button size="sm" variant="outline" asChild>
            <Link to="/menu/$date" params={{ date: handoff.affectedMeal.date }} search={{ meal: handoff.affectedMeal.meal, focus: true }}>
              View Affected Meal <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function MealCellDetails({ ws, day, meal }: { ws: WorkspaceState; day: number; meal: number }) {
  const status = cellStatus(ws, day, meal);
  const isWed = day === 2 && meal === 1;
  const isFri = day === 4 && meal === 1;
  const sub = isWed ? SUBSTITUTIONS[0]! : isFri ? SUBSTITUTIONS[1]! : null;
  const decision = sub ? ws.decisions[sub.id] : null;
  const name = sub && decision && (decision.state === "approved")
    ? sub.proposals[decision.proposalIndex]
    : (MEAL_NAMES[meal]?.[day] ?? "Planned meal");
  return (
    <>
      <DialogHeader>
        <DialogTitle>{WEEK_DAYS[day]} {MEAL_ROWS[meal]} — {name}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 text-sm">
        {status === "unplanned" ? (
          <p className="text-muted-foreground">This meal has not been planned yet. Generate the weekly plan to fill all 21 slots.</p>
        ) : (
          <>
            <div className="flex gap-2"><span className="w-28 shrink-0 text-muted-foreground">Recipe</span><span className="font-medium">{name}</span></div>
            {sub && (
              <div className="flex gap-2"><span className="w-28 shrink-0 text-muted-foreground">Original</span><span>{sub.original}</span></div>
            )}
            <div className="flex gap-2"><span className="w-28 shrink-0 text-muted-foreground">Alternatives</span><span>Dairy-free and soft-texture alternatives included where required.</span></div>
            <div className="flex gap-2"><span className="w-28 shrink-0 text-muted-foreground">Dietary check</span><span className="flex items-center gap-1"><Check className="size-3.5 text-success" />Passed</span></div>
            <div className="flex gap-2"><span className="w-28 shrink-0 text-muted-foreground">Inventory check</span>
              {sub && decision?.state !== "approved"
                ? <span className="flex items-center gap-1 text-warning"><TriangleAlert className="size-3.5" />Shortage — substitution proposed</span>
                : <span className="flex items-center gap-1"><Check className="size-3.5 text-success" />Passed</span>}
            </div>
            {sub && decision?.state !== "approved" && (
              <p className="rounded-lg bg-warning-soft p-2 text-xs text-warning">Pending manager decision: approve the proposed substitution for this meal.</p>
            )}
            {status === "approved" && (
              <p className="rounded-lg bg-success-soft p-2 text-xs text-success">Approved by the kitchen manager as part of the weekly plan.</p>
            )}
            <Button size="sm" variant="outline" asChild>
              <Link to="/menu/$date" params={{ date: sub?.date ?? "2026-11-16" }} search={{ meal: MEAL_ROWS[meal]!.toLowerCase() as "breakfast" | "lunch" | "dinner", focus: true }}>
                Open in Daily Menu <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </>
        )}
      </div>
    </>
  );
}
