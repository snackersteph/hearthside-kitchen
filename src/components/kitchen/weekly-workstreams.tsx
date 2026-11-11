import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ShoppingCart,
  Sparkles,
  TriangleAlert,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { useKitchen } from "@/lib/kitchen/store";
import { dateKey } from "@/lib/kitchen/schedule";
import { parseDateKey } from "@/lib/kitchen/weekly-schedule";
import {
  weekRange,
  weeklyWorkstreams,
  type WeekStatusInfo,
  type WorkstreamAlert,
} from "@/lib/kitchen/weekly-operations";
import { WeekStatusBadge } from "@/components/kitchen/week-status";
import { cn } from "@/lib/utils";

const PURCHASING_LABEL = {
  "not-started": "Not started",
  draft: "Draft",
  "needs-review": "Needs review",
  approved: "Approved",
} as const;

const shortDate = (key: string) =>
  parseDateKey(key)?.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }) ?? key;
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

function Workstream({
  eyebrow,
  icon: Icon,
  info,
  children,
  action,
}: {
  eyebrow: string;
  icon: LucideIcon;
  info: WeekStatusInfo;
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <article
      aria-label={`${eyebrow}: ${weekRange(info.startDate, info.endDate)}`}
      className={cn(
        "pulse-week rounded-xl border bg-card shadow-soft",
        info.outstanding.length > 0 && "border-destructive/40",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Icon className="size-3.5 text-primary" />
            {eyebrow}
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold">
            {weekRange(info.startDate, info.endDate)}
          </h3>
        </div>
        <WeekStatusBadge info={info} />
      </header>
      {info.outstanding.length > 0 && (
        <ul aria-label="Outstanding actions" className="space-y-1">
          {info.outstanding.map((o) => (
            <li
              key={o.kind}
              className="flex items-start gap-1.5 rounded-md bg-danger-soft px-2.5 py-1.5 text-xs font-medium text-destructive"
            >
              <TriangleAlert className="mt-px size-3.5 shrink-0" />
              {o.message}
            </li>
          ))}
        </ul>
      )}
      <dl className="space-y-1.5">{children}</dl>
      <div className="pulse-week-action">{action}</div>
    </article>
  );
}

function AlertList({ alerts }: { alerts: WorkstreamAlert[] }) {
  if (!alerts.length)
    return <p className="text-xs font-medium text-success">No urgent alerts for this week.</p>;
  return (
    <ul aria-label="Urgent alerts" className="space-y-1">
      {alerts.map((a) => {
        const body = (
          <>
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            {a.message}
          </>
        );
        const cls = cn(
          "flex items-start gap-1.5 text-xs font-medium",
          a.tone === "danger" ? "text-destructive" : "text-warning",
        );
        return (
          <li key={a.message}>
            {a.to ? (
              <Link
                to={a.to}
                search={a.inventoryView ? { view: a.inventoryView } : {}}
                className={cn(cls, "hover:underline")}
              >
                {body}
              </Link>
            ) : (
              <span className={cls}>{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const actionClass =
  "inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-primary hover:underline";

/** Kitchen Pulse: the three service weeks in flight, derived from the same state as the Agent Workspace. */
export function WeeklyWorkstreams() {
  const { state, analysis, reference } = useKitchen();
  const { service, purchasing, planning } = weeklyWorkstreams(state, analysis, reference);
  const today = dateKey(reference);
  const serviceDate =
    today >= service.startDate && today <= service.endDate ? today : service.startDate;

  return (
    <section className="pulse-weeks" aria-label="Weekly workstreams">
      <div className="pulse-weeks-heading">
        <h2 className="text-xl font-semibold">Service weeks</h2>
        <p className="text-sm text-muted-foreground">
          Serve this week, purchase for next week, plan two weeks out.
        </p>
      </div>

      <Workstream
        eyebrow="Current week · Service"
        icon={UtensilsCrossed}
        info={service}
        action={
          <Link to="/menu/$date" params={{ date: serviceDate }} className={actionClass}>
            View Service Menu
            <ArrowRight className="size-3.5" />
          </Link>
        }
      >
        <Fact label="Meals served">
          {service.served} of {service.served + service.remaining}
        </Fact>
        <Fact label="Today and ahead">
          {service.remainingApproved} of {service.remaining} signed off
        </Fact>
        <div className="pt-1">
          <AlertList alerts={service.alerts} />
        </div>
      </Workstream>

      <Workstream
        eyebrow="Next week · Purchasing"
        icon={ShoppingCart}
        info={purchasing}
        action={
          <Link to="/approvals" search={{ kind: "purchase" }} className={actionClass}>
            Review Purchasing
            <ArrowRight className="size-3.5" />
          </Link>
        }
      >
        <Fact label="Menu">
          {purchasing.menuApproved ? (
            <span className="text-success">Approved</span>
          ) : (
            <span className="text-warning">Not approved</span>
          )}
        </Fact>
        <Fact label="Weekly purchasing">{PURCHASING_LABEL[purchasing.purchasingStatus]}</Fact>
        <Fact label="Agent recommendation">
          {purchasing.recommended
            ? `${purchasing.recommended.lines} item${purchasing.recommended.lines === 1 ? "" : "s"} · ${money(purchasing.recommended.total)}`
            : "None yet"}
        </Fact>
        <Fact label="Orders awaiting approval">{purchasing.pendingOrders}</Fact>
        <Fact label="Expected deliveries">
          {purchasing.deliveries.count
            ? `${purchasing.deliveries.count} · next ${shortDate(purchasing.deliveries.next!)}`
            : "None scheduled"}
        </Fact>
      </Workstream>

      <Workstream
        eyebrow="In two weeks · Planning"
        icon={Sparkles}
        info={planning}
        action={
          <Link to="/dashboard" search={{ week: planning.startDate }} className={actionClass}>
            Open Agent Workspace
            <ArrowRight className="size-3.5" />
          </Link>
        }
      >
        <Fact label="Meals generated">{planning.mealsGenerated} of 21</Fact>
        <Fact label="Agent collaboration">{planning.collaboration}</Fact>
        <Fact label="Revisions to decide">{planning.pendingRevisions}</Fact>
        <Fact label="Alternatives to approve">{planning.pendingAlternatives}</Fact>
        <Fact label="Weekly sign-off">
          {planning.status === "menu-approved" || planning.plan?.menuStatus === "approved"
            ? "Approved"
            : !planning.run
              ? "Not generated"
              : planning.blockers
                ? `${planning.blockers} blocker${planning.blockers === 1 ? "" : "s"}`
                : "Ready to approve"}
        </Fact>
      </Workstream>
    </section>
  );
}
