import { useState, type ReactNode } from "react";
import { CircleAlert, Info, ShoppingCart, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/kitchen/agents";
import { weekRange } from "@/lib/kitchen/weekly-operations";
import { parseDateKey } from "@/lib/kitchen/weekly-schedule";
import type { WeeklyPurchasePlan, WeeklyPurchaseRow } from "@/lib/kitchen/weekly-purchasing";
import { cn } from "@/lib/utils";

const STATE_LABEL: Record<
  WeeklyPurchasePlan["state"],
  { label: string; tone: "ok" | "warn" | "danger" | "neutral" }
> = {
  "awaiting-menu": { label: "Waiting for menu approval", tone: "neutral" },
  "needs-review": { label: "Draft · needs your approval", tone: "warn" },
  "ready-to-confirm": { label: "Ready to confirm", tone: "warn" },
  approved: { label: "Purchasing approved", tone: "ok" },
};

const shortDate = (key: string) =>
  parseDateKey(key)?.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }) ?? key;
const q = (n: number, unit: string) => `${Math.round(n * 100) / 100}${unit ? ` ${unit}` : ""}`;
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function weeklyPurchasingTitle(plan: Pick<WeeklyPurchasePlan, "startDate" | "endDate">) {
  return `Service week ${weekRange(plan.startDate, plan.endDate)}`;
}

function Row({ row }: { row: WeeklyPurchaseRow }) {
  const incoming = row.incomingBeforeService + row.incomingDuringService;
  return (
    <tr className="align-top">
      <th scope="row" className="px-3 py-2.5 text-left font-medium">
        {row.name}
        <span className="block text-xs font-normal text-muted-foreground">{row.vendor}</span>
        {row.flags.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {row.flags.map((f) => (
              <li key={f} className="flex gap-1 text-[11px] font-normal text-warning">
                <CircleAlert className="mt-px size-3 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        )}
      </th>
      <td className="px-3 py-2.5">{q(row.onHand, row.unit)}</td>
      <td className="px-3 py-2.5">
        {row.plannedUseBeforeService ? q(row.plannedUseBeforeService, row.unit) : "—"}
      </td>
      <td className="px-3 py-2.5">
        {incoming ? (
          <>
            {q(incoming, row.unit)}
            {row.incomingDuringService > 0 && (
              <span className="block text-[11px] text-muted-foreground">
                {q(row.incomingDuringService, row.unit)} mid-week
              </span>
            )}
          </>
        ) : (
          "—"
        )}
      </td>
      <td className="px-3 py-2.5">{q(row.projectedUsable, row.unit)}</td>
      <td className="px-3 py-2.5">{q(row.requiredDuringService, row.unit)}</td>
      <td className="px-3 py-2.5 font-semibold">
        {row.proposedQty > 0 ? (
          q(row.proposedQty, row.unit)
        ) : (
          <span className="font-normal text-success">Covered</span>
        )}
        {row.shortfall > 0 && (
          <span className="block text-[11px] font-normal text-muted-foreground">
            short {q(row.shortfall, row.unit)}
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 text-xs">
        {row.batches.length ? (
          row.batches.map((b) => (
            <div key={b.deliveryDate}>
              {q(b.qty, row.unit)} by {shortDate(b.deliveryDate)}
            </div>
          ))
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        <span className="mt-0.5 block text-[11px] text-muted-foreground">
          {row.shelfLifeDays === null
            ? "Shelf life not on file"
            : `Keeps ${row.shelfLifeDays} d${row.shelfLifeSource === "assumed" ? " (assumed)" : ""}`}
        </span>
      </td>
    </tr>
  );
}

/**
 * Week-specific purchasing derived from an approved weekly menu. Shared by Inventory and the
 * Approval Center so both show the same numbers; `children` holds page-specific actions.
 */
export function WeeklyPurchasingPanel({
  plan,
  children,
  defaultOpen = false,
}: {
  plan: WeeklyPurchasePlan;
  children?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  const short = plan.rows.filter((r) => r.shortfall > 0);
  const rows = showAll ? plan.rows : short;
  const status = plan.invalidated
    ? { label: "Withdrawn · menu changed", tone: "danger" as const }
    : STATE_LABEL[plan.state];
  const onTheWay = plan.orders.filter((o) => o.status === "incoming").length;
  const received = plan.orders.length - onTheWay;
  return (
    <section
      aria-label={`Weekly purchasing, ${weeklyPurchasingTitle(plan)}`}
      className="mb-6 rounded-lg border border-agent-inventory bg-card p-4 shadow-soft"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-agent-inventory">
            <ShoppingCart className="size-3.5" />
            Weekly purchasing
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold">{weeklyPurchasingTitle(plan)}</h3>
          <p className="text-sm text-muted-foreground">
            {plan.state === "awaiting-menu"
              ? "A shopping list is drafted once this week's menu is approved."
              : `${short.length} of ${plan.rows.length} ingredients to purchase · ${plan.proposals.length} request${plan.proposals.length === 1 ? "" : "s"} awaiting approval${plan.total ? ` · ${money(plan.total)} estimated` : ""}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone={status.tone}>{status.label}</Tag>
          {plan.orders.length > 0 && (
            <Tag>
              <Truck className="mr-1 inline size-3" />
              {onTheWay} on the way · {received} received
            </Tag>
          )}
        </div>
      </div>
      {plan.flags.length > 0 && (
        <ul className="mt-3 space-y-1">
          {plan.flags.map((f) => (
            <li key={f} className="flex gap-1.5 text-sm text-warning">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              {f}
            </li>
          ))}
        </ul>
      )}
      {plan.rows.length > 0 && (
        <div className="mt-3">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? "Hide" : "Show"} stock breakdown
          </Button>
          {open && (
            <>
              <div className="mt-2 overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Ingredient</th>
                      <th className="px-3 py-2">On hand</th>
                      <th className="px-3 py-2">Planned use before service</th>
                      <th className="px-3 py-2">Incoming</th>
                      <th className="px-3 py-2">Projected usable</th>
                      <th className="px-3 py-2">Required in service</th>
                      <th className="px-3 py-2">To purchase</th>
                      <th className="px-3 py-2">Delivery · freshness</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((r) => (
                      <Row key={r.ingredientId} row={r} />
                    ))}
                  </tbody>
                </table>
              </div>
              {!rows.length && (
                <p className="mt-2 text-sm text-success">
                  Stock and incoming orders cover every ingredient this week.
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Info className="mt-px size-3.5 shrink-0" />
                  Planned use is reserved in the forecast only; stock changes when deliveries are
                  received. Orders approved for this week are kept for it. Simulated vendors: no
                  real orders are sent.
                </p>
                {short.length !== plan.rows.length && (
                  <Button variant="link" size="sm" onClick={() => setShowAll(!showAll)}>
                    {showAll
                      ? "Only ingredients to purchase"
                      : `Show all ${plan.rows.length} ingredients`}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}
      {children && (
        <div className={cn("mt-4 space-y-3", plan.rows.length > 0 && "border-t pt-4")}>
          {children}
        </div>
      )}
    </section>
  );
}
