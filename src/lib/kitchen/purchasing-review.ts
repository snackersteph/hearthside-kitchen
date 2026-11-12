import type { WeeklyPurchasePlan } from "./weekly-purchasing";

/** Scoped purchasing review excludes decided orders and withdrawn drafts. */
export function pendingPurchasingWeeks(plans: WeeklyPurchasePlan[], startDate: string) {
  return plans.filter((plan) => plan.startDate === startDate && !plan.invalidated && plan.state === "needs-review" && plan.proposals.length > 0);
}