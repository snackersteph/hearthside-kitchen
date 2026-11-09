import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftRight, ArrowRight, CheckCircle2, ChefHat, Clock, HeartPulse, Package, TriangleAlert, UserCheck, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/kitchen/app-shell";
import { dateKey, dayAt } from "@/lib/kitchen/schedule";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Agent Dashboard · NutriSync" },
      { name: "description", content: "See what your AI team is working on: workflow status and a timeline of agent activity." },
      { property: "og:title", content: "Agent Dashboard · NutriSync" },
      { property: "og:description", content: "See what your AI team is working on: workflow status and a timeline of agent activity." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

const STEPS = ["Not Started", "Generating", "Needs Review", "Checks Complete", "Approved"] as const;
const CURRENT_STEP = 2; // "Needs Review"

type Status = "completed" | "warning" | "pending";
interface TimelineEvent {
  agent: string;
  icon: LucideIcon;
  status: Status;
  title: string;
  description: string;
  time: string;
  link?: "affected" | "review";
}

const EVENTS: TimelineEvent[] = [
  { agent: "Dietary Agent", icon: HeartPulse, status: "completed", time: "6:02 AM", title: "Resident requirements reviewed", description: "Reviewed all 12 residents. Identified 2 dairy-free requirements and 1 soft-texture requirement." },
  { agent: "Menu Agent", icon: ChefHat, status: "completed", time: "6:05 AM", title: "Daily menu generated", description: "Created breakfast, lunch, and dinner plans with resident-specific alternatives." },
  { agent: "Inventory Agent", icon: Package, status: "warning", time: "6:07 AM", title: "Ingredient shortage detected", description: "Chicken: 6 portions available, 10 required.", link: "affected" },
  { agent: "Menu Agent", icon: ChefHat, status: "completed", time: "6:09 AM", title: "Alternative proposed", description: "Suggested replacing chicken with a lentil-based lunch to avoid the shortage." },
  { agent: "Dietary Agent", icon: ArrowLeftRight, status: "completed", time: "6:10 AM", title: "Alternative checked", description: "The replacement passed known dietary rule checks and has sufficient recorded inventory." },
  { agent: "Manager Review", icon: UserCheck, status: "pending", time: "Now", title: "Your approval is required", description: "Review the proposed lunch substitution before finalizing tomorrow's menu.", link: "review" },
];

const STATUS: Record<Status, { icon: LucideIcon; label: string; className: string; dot: string }> = {
  completed: { icon: CheckCircle2, label: "Completed", className: "text-success", dot: "bg-success-soft text-success" },
  warning: { icon: TriangleAlert, label: "Warning", className: "text-warning", dot: "bg-warning-soft text-warning" },
  pending: { icon: Clock, label: "Pending", className: "text-muted-foreground", dot: "bg-muted text-foreground" },
};

function DashboardPage() {
  const tomorrow = dateKey(dayAt(1));
  const pct = (CURRENT_STEP / (STEPS.length - 1)) * 100;
  return (
    <>
      <PageHeader eyebrow="Agents" title="Agent Dashboard" />
      <p className="-mt-4 mb-8 text-muted-foreground">See what your AI team is working on.</p>

      <section className="mb-10 rounded-xl border bg-card p-5 shadow-soft" aria-label="Workflow status">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Workflow status</h2>
          <span className="text-sm text-muted-foreground">Step {CURRENT_STEP + 1} of {STEPS.length} · <span className="font-medium text-foreground">{STEPS[CURRENT_STEP]}</span></span>
        </div>
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <ol className="grid grid-cols-5 gap-2 text-center text-xs">
          {STEPS.map((step, i) => (
            <li key={step} className="flex flex-col items-center gap-1.5">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold ${i < CURRENT_STEP ? "border-primary bg-primary text-primary-foreground" : i === CURRENT_STEP ? "border-warning bg-warning-soft text-foreground" : "bg-background text-muted-foreground"}`}>
                {i < CURRENT_STEP ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </span>
              <span className={i === CURRENT_STEP ? "font-semibold text-foreground" : "text-muted-foreground"}>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="max-w-3xl" aria-label="Agent activity">
        <h2 className="mb-4 text-lg font-semibold">Agent activity</h2>
        <ol className="relative">
          {EVENTS.map((e, i) => {
            const S = STATUS[e.status];
            const Icon = e.icon;
            const last = i === EVENTS.length - 1;
            return (
              <li key={i} className="relative flex gap-4 pb-6">
                {!last && <span className="absolute left-5 top-11 bottom-0 w-px bg-border" aria-hidden />}
                <span className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${S.dot}`}><Icon className="h-5 w-5" /></span>
                <div className={`min-w-0 flex-1 rounded-lg border bg-card p-4 ${e.status === "warning" ? "border-warning" : ""}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{e.agent}</span>
                    <span className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className={`flex items-center gap-1 font-medium ${S.className}`}><S.icon className="h-4 w-4" />{S.label}</span>
                      <time>{e.time}</time>
                    </span>
                  </div>
                  <h3 className="mt-1 font-semibold">{e.title}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">{e.description}</p>
                  {e.link === "affected" && (
                    <Link to="/menu/$date" params={{ date: tomorrow }} search={{ meal: "lunch", focus: true }} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                      View affected meal <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                  {e.link === "review" && (
                    <Link to="/menu/$date" params={{ date: tomorrow }} search={{ meal: "lunch", focus: true }} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                      View details <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}
