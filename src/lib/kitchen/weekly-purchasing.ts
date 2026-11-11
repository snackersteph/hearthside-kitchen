import { lineCost } from "./engine";
import { projectWeekInventory, type IngredientProjection } from "./agent-workflow";
import { shelfLife, type ShelfLifeSource } from "./ingredient-freshness";
import { dateKey } from "./schedule";
import type { KitchenState, PurchaseLine, PurchaseOrder, PurchaseProposal } from "./types";
import {
  DEFAULT_LEAD_TIME_DAYS,
  addDays,
  applyWeeklyStatus,
  daysBetween,
  lifecycleDates,
  parseDateKey,
  type WeeklyPlan,
} from "./weekly-schedule";

// Week-specific purchasing, derived (never stored) from an APPROVED weekly menu.
// Demand comes from projectWeekInventory, which resolves every service date through the
// shared schedule: approved main dishes plus resident-specific alternatives in effect.
// Nothing here changes stock. Planned use before service is a reservation in the
// projection only; on-hand stock changes solely through order receipts or staff edits.
// Approval reuses the existing approvePurchase/reject actions; delivery reuses receiveOrder.

export interface DeliveryBatch {
  deliveryDate: string;
  /** First service date this batch must cover. */
  neededDate: string;
  shortfall: number;
  qty: number;
}

export interface WeeklyPurchaseRow {
  ingredientId: string;
  name: string;
  unit: string;
  vendor: string;
  packSize: number;
  /** Physical stock today. */
  onHand: number;
  /** Use planned from today until service starts (reserved in the projection, not deducted). */
  plannedUseBeforeService: number;
  /** Deliveries already on order: before service starts and during the week. */
  incomingBeforeService: number;
  incomingDuringService: number;
  /** Stock expected to be on hand when service starts (earlier deficits are not carried in). */
  projectedUsable: number;
  /** Shortfall before service starts; belongs to the earlier week's purchasing. */
  shortBeforeService: number;
  requiredDuringService: number;
  /** Quantity still short during the service week after stock and incoming orders. */
  shortfall: number;
  proposedQty: number;
  cost: number;
  firstShortDate: string | null;
  shelfLifeDays: number | null;
  shelfLifeSource: ShelfLifeSource;
  batches: DeliveryBatch[];
  flags: string[];
}

export type WeeklyPurchasingState =
  "awaiting-menu" | "needs-review" | "ready-to-confirm" | "approved";

export interface WeeklyPurchasePlan {
  weekId: string;
  startDate: string;
  endDate: string;
  state: WeeklyPurchasingState;
  /** True when the menu was approved earlier but has since changed and must be re-approved. */
  invalidated: boolean;
  /** Every ingredient the week's service needs. Empty until the menu is approved. */
  rows: WeeklyPurchaseRow[];
  /** Draft requests still awaiting the manager (one per vendor and delivery date). */
  proposals: PurchaseProposal[];
  /** Draft requests the manager rejected; their shortfall remains. */
  rejected: PurchaseProposal[];
  /** Orders approved for this week, delivered or not. */
  orders: PurchaseOrder[];
  total: number;
  flags: string[];
}

const round = (n: number) => Math.round(n * 100) / 100;
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const label = (key: string) =>
  parseDateKey(key)?.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }) ?? key;
const packUp = (qty: number, pack: number) =>
  round(Math.ceil(qty / (pack > 0 ? pack : 1) - 1e-9) * (pack > 0 ? pack : 1));
const fmt = (n: number, unit: string) => `${round(n)}${unit ? ` ${unit}` : ""}`;

/** Earliest planned delivery for a week: the Sunday before service, or the lead time if that is later. */
export function plannedDeliveryDate(
  startDate: string,
  leadTimeDays: number,
  reference = new Date(),
) {
  const byLead = addDays(dateKey(reference), Math.max(1, leadTimeDays));
  const dayBefore = addDays(startDate, -1);
  return byLead > dayBefore ? byLead : dayBefore;
}

interface Supply {
  from: string;
  through: string | null;
  qty: number;
}

/** Remaining need per service date after stock and incoming deliveries, respecting shelf life. */
function freshNeeds(
  dates: string[],
  p: IngredientProjection,
  shelfDays: number | null,
): [string, number][] {
  const start = dates[0];
  if (!start) return [];
  const through = (delivery: string) => (shelfDays ? addDays(delivery, shelfDays - 1) : null);
  const reserved = p.reservedArrivals.reduce((n, l) => n + l.qty, 0);
  const supplies: Supply[] = [
    { from: start, through: null, qty: round(Math.max(0, p.availableAtWeekStart - reserved)) },
    ...p.reservedArrivals.map((l) => ({ from: start, through: through(l.date), qty: l.qty })),
    ...Object.entries(p.arrivalsDuringWeek).map(([date, qty]) => ({
      from: date,
      through: through(date),
      qty,
    })),
  ];
  const needs: [string, number][] = [];
  for (const date of dates) {
    let need = p.dailyNeed[date] ?? 0;
    const usable = supplies
      .filter((x) => x.qty > 0 && x.from <= date && (x.through === null || x.through >= date))
      .sort((a, b) => (a.through ?? "9999").localeCompare(b.through ?? "9999"));
    for (const x of usable) {
      if (need <= 0) break;
      const take = Math.min(x.qty, need);
      x.qty = round(x.qty - take);
      need = round(need - take);
    }
    if (need > 0) needs.push([date, need]);
  }
  return needs;
}

/**
 * Splits a week's shortages into deliveries so nothing is bought to sit past its shelf life:
 * a batch covers service dates up to its delivery date + shelf life − 1, then the next batch
 * arrives the day before the next uncovered need. Unknown shelf life → one batch, flagged.
 */
function batchesFor(
  needs: [string, number][],
  baseDelivery: string,
  shelfDays: number | null,
  pack: number,
): DeliveryBatch[] {
  const batches: DeliveryBatch[] = [];
  let current: DeliveryBatch | null = null;
  for (const [date, qty] of needs) {
    const usableThrough =
      current && shelfDays ? addDays(current.deliveryDate, shelfDays - 1) : null;
    if (!current || (usableThrough && date > usableThrough)) {
      const dayBefore = addDays(date, -1);
      // Deliver by the Sunday before service unless that stock would spoil before this need.
      const baseFresh = !shelfDays || date <= addDays(baseDelivery, shelfDays - 1);
      current = {
        deliveryDate: baseFresh || dayBefore < baseDelivery ? baseDelivery : dayBefore,
        neededDate: date,
        shortfall: 0,
        qty: 0,
      };
      batches.push(current);
    }
    current.shortfall = round(current.shortfall + qty);
  }
  for (const b of batches) b.qty = packUp(b.shortfall, pack);
  return batches;
}

const proposalId = (
  startDate: string,
  vendor: string,
  deliveryDate: string,
  lines: PurchaseLine[],
) =>
  `wpo-${startDate}-${slug(vendor)}-${deliveryDate}-${lines.map((l) => `${l.ingredientId}.${l.qty}`).join("_")}`;

export function weeklyPurchasePlan(
  s: KitchenState,
  plan: WeeklyPlan,
  reference = new Date(),
): WeeklyPurchasePlan {
  const base = {
    weekId: plan.id,
    startDate: plan.startDate,
    endDate: plan.endDate,
    orders: (s.orders ?? []).filter((o) => o.serviceWeekId === plan.id),
  };
  if (plan.menuStatus !== "approved") {
    const invalidated =
      plan.menuApprovedAt === null &&
      (plan.purchasingStatus !== "not-started" ||
        base.orders.length > 0 ||
        (plan.revalidationSlots?.length ?? 0) > 0);
    return {
      ...base,
      state: "awaiting-menu",
      invalidated,
      rows: [],
      proposals: [],
      rejected: [],
      total: 0,
      flags: invalidated
        ? [
            "The approved menu changed, so its purchasing recommendation is withdrawn until the week is re-approved. Orders already approved stay on order.",
          ]
        : [],
    };
  }
  const today = dateKey(reference);
  const lead = Math.max(1, s.leadTimeDays ?? DEFAULT_LEAD_TIME_DAYS);
  const baseDelivery = plannedDeliveryDate(plan.startDate, lead, reference);
  const dueDate = lifecycleDates(plan.startDate, lead).purchasingDueDate;
  const projection = projectWeekInventory(s, plan, reference);
  const rows: WeeklyPurchaseRow[] = [];
  const flags: string[] = [];

  for (const p of projection.ingredients.values()) {
    if (p.requirement <= 0) continue;
    const ingredient = s.ingredients.find((i) => i.id === p.ingredientId);
    const life = shelfLife(ingredient, p.ingredientId);
    const rowFlags: string[] = [];
    // Shortfall per service date. Supplies are used earliest-expiring first and only while fresh:
    // deliveries with a known date keep for the shelf life; stock already on hand has no
    // tracked received date, so it is treated as usable and flagged below.
    const needs = freshNeeds(projection.dates, p, life.days);
    const shortfall = round(needs.reduce((n, [, q]) => n + q, 0));
    const batches = shortfall > 0 ? batchesFor(needs, baseDelivery, life.days, p.packSize) : [];
    const proposedQty = round(batches.reduce((n, b) => n + b.qty, 0));

    if (!ingredient)
      rowFlags.push(
        "Not in inventory: no vendor, pack size or price on file. Add the ingredient before ordering.",
      );
    if (life.source === "missing")
      rowFlags.push(
        "Shelf life not on file: confirm delivery timing so stock stays usable all week.",
      );
    else if (life.source === "assumed" && shortfall > 0)
      rowFlags.push(
        `Shelf life assumed ${life.days} days (planning assumption, not a supplier date).`,
      );
    if (batches.length > 1)
      rowFlags.push(
        `Split into ${batches.length} deliveries so stock is used within its shelf life; each delivery rounds up to a full pack.`,
      );
    const late = batches.find((b) => b.deliveryDate > b.neededDate);
    if (late)
      rowFlags.push(
        `Needed ${label(late.neededDate)} but the earliest delivery is ${label(late.deliveryDate)}; arrange an alternative for that service.`,
      );
    if (
      life.days !== null &&
      p.onHand > 0 &&
      daysBetween(today, plan.endDate) + 1 > life.days &&
      p.availableAtWeekStart > 0
    )
      rowFlags.push(
        "Received dates of current stock aren't tracked; check it is still usable before relying on it for this week.",
      );
    if (p.unclampedAtWeekStart < 0)
      rowFlags.push(
        `${fmt(-p.unclampedAtWeekStart, p.unit)} runs short before service starts; that belongs to the current week's purchasing.`,
      );

    rows.push({
      ingredientId: p.ingredientId,
      name: p.name,
      unit: p.unit,
      vendor: p.vendor,
      packSize: p.packSize,
      onHand: p.onHand,
      plannedUseBeforeService: p.useBeforeWeek,
      incomingBeforeService: p.incomingBeforeWeek,
      incomingDuringService: p.incomingDuringWeek,
      projectedUsable: p.availableAtWeekStart,
      shortBeforeService: p.unclampedAtWeekStart < 0 ? round(-p.unclampedAtWeekStart) : 0,
      requiredDuringService: p.requirement,
      shortfall,
      proposedQty,
      cost: ingredient ? lineCost(s, p.ingredientId, proposedQty) : 0,
      firstShortDate: needs[0]?.[0] ?? null,
      shelfLifeDays: life.days,
      shelfLifeSource: life.source,
      batches,
      flags: rowFlags,
    });
  }
  rows.sort(
    (a, b) => Number(b.shortfall > 0) - Number(a.shortfall > 0) || a.name.localeCompare(b.name),
  );

  // One draft request per vendor and delivery date.
  const groups = new Map<
    string,
    {
      vendor: string;
      deliveryDate: string;
      neededDate: string;
      lines: PurchaseLine[];
      flags: string[];
    }
  >();
  for (const row of rows) {
    if (!s.ingredients.some((i) => i.id === row.ingredientId)) continue;
    for (const b of row.batches) {
      const key = `${row.vendor}|${b.deliveryDate}`;
      const g = groups.get(key) ?? {
        vendor: row.vendor,
        deliveryDate: b.deliveryDate,
        neededDate: b.neededDate,
        lines: [],
        flags: [],
      };
      g.lines.push({ ingredientId: row.ingredientId, shortage: b.shortfall, qty: b.qty });
      if (b.neededDate < g.neededDate) g.neededDate = b.neededDate;
      g.flags.push(...row.flags.map((f) => `${row.name}: ${f}`));
      groups.set(key, g);
    }
  }
  const decided = new Map(
    s.history.filter((h) => h.kind === "purchase").map((h) => [h.proposalId, h.status]),
  );
  const proposals: PurchaseProposal[] = [];
  const rejected: PurchaseProposal[] = [];
  for (const g of [...groups.values()].sort(
    (a, b) => a.deliveryDate.localeCompare(b.deliveryDate) || a.vendor.localeCompare(b.vendor),
  )) {
    const orderBy = addDays(g.deliveryDate, -lead);
    const proposal: PurchaseProposal = {
      id: proposalId(plan.startDate, g.vendor, g.deliveryDate, g.lines),
      kind: "purchase",
      agent: "inventory",
      vendor: g.vendor,
      lines: g.lines,
      total: round(g.lines.reduce((n, l) => n + lineCost(s, l.ingredientId, l.qty), 0)),
      deliveryDate: g.deliveryDate,
      neededDate: g.neededDate,
      orderByDate: g.deliveryDate === baseDelivery && dueDate < orderBy ? dueDate : orderBy,
      serviceWeekId: plan.id,
      flags: [...new Set(g.flags)],
    };
    const status = decided.get(proposal.id);
    if (status === "rejected") rejected.push(proposal);
    else if (status !== "approved") proposals.push(proposal);
  }
  if (rejected.length)
    flags.push(
      `${rejected.length} rejected request${rejected.length === 1 ? "" : "s"} leave${rejected.length === 1 ? "s" : ""} a shortfall for this week.`,
    );
  if (rows.some((r) => r.shelfLifeSource === "missing"))
    flags.push("Some ingredients have no shelf life on file; their delivery timing is unverified.");
  if (dueDate < today && proposals.length)
    flags.push(
      `The purchasing deadline (${label(dueDate)}) has passed; approve as soon as possible.`,
    );
  const state: WeeklyPurchasingState =
    plan.purchasingStatus === "approved"
      ? "approved"
      : proposals.length
        ? "needs-review"
        : "ready-to-confirm";
  return {
    ...base,
    state,
    invalidated: false,
    rows,
    proposals,
    rejected,
    total: round(proposals.reduce((n, p) => n + p.total, 0)),
    flags,
  };
}

/** Weekly purchasing for every service week that has not ended. */
export function activeWeeklyPurchasing(
  s: KitchenState,
  reference = new Date(),
): WeeklyPurchasePlan[] {
  const today = dateKey(reference);
  return (s.weeklyPlans ?? [])
    .filter(
      (p) =>
        p.endDate >= today &&
        (p.menuStatus === "approved" ||
          p.purchasingStatus !== "not-started" ||
          (s.orders ?? []).some((o) => o.serviceWeekId === p.id)),
    )
    .map((p) => weeklyPurchasePlan(s, p, reference));
}

export const weeklyPurchaseProposals = (plans: WeeklyPurchasePlan[]) =>
  plans.flatMap((p) => p.proposals);

const setPurchasing = (
  s: KitchenState,
  plan: WeeklyPlan,
  status: WeeklyPlan["purchasingStatus"],
  reference: Date,
): KitchenState => {
  const next = applyWeeklyStatus(plan, { purchasingStatus: status }, reference);
  return !next || next === plan
    ? s
    : { ...s, weeklyPlans: (s.weeklyPlans ?? []).map((p) => (p.id === plan.id ? next : p)) };
};

/** After a menu approval, its draft purchasing list waits for the manager's separate review. */
export function openWeeklyPurchasing(
  s: KitchenState,
  weekId: string,
  reference = new Date(),
): KitchenState {
  const plan = s.weeklyPlans?.find((p) => p.id === weekId);
  if (
    !plan ||
    plan.menuStatus !== "approved" ||
    plan.purchasingStatus === "approved" ||
    plan.purchasingStatus === "needs-review"
  )
    return s;
  return setPurchasing(s, plan, "needs-review", reference);
}

/**
 * Weekly purchasing is approved once the manager has decided every draft request for the week
 * (approved ones become incoming orders; delivery still requires receiving them).
 * `confirm` lets the manager sign off a week with nothing left to decide (e.g. no shortages).
 */
export function settleWeeklyPurchasing(
  s: KitchenState,
  weekId: string,
  reference = new Date(),
  confirm = false,
): KitchenState {
  const plan = s.weeklyPlans?.find((p) => p.id === weekId);
  if (!plan || plan.menuStatus !== "approved" || plan.purchasingStatus === "approved") return s;
  const pending = weeklyPurchasePlan(s, plan, reference).proposals.length;
  if (pending) return setPurchasing(s, plan, "needs-review", reference);
  const decidedAny = s.history.some((h) => h.kind === "purchase" && h.serviceWeekId === weekId);
  return confirm || decidedAny ? setPurchasing(s, plan, "approved", reference) : s;
}
