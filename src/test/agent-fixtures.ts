import { initialState } from "@/lib/kitchen/data";
import { InventoryWorkspace, type Shortage } from "@/lib/kitchen/inventory-agent";
import type { KitchenState } from "@/lib/kitchen/types";

/** Fixed "today" so tests do not depend on the real date. */
export const reference = new Date("2026-11-09T12:00:00");

const GLUTEN_FREE = ["gf-pasta", "gf-bread", "oats"];

export interface AgentScenario {
  state: KitchenState;
  /** A shortage an eligible vendor can deliver in time, and that vendor's id. */
  ok: Shortage;
  okVendorId: string;
  /** A shortage that every eligible vendor delivers too late, and one such vendor's id. */
  slow: Shortage;
  slowVendorId: string;
  /** A shortage whose only supplier (Hearth Bakery) has an unverified gluten-free certificate. */
  unverified: Shortage;
}

/**
 * Builds a kitchen whose shortages cover every sourcing outcome, whatever dishes the team has
 * on the menu. Every ingredient starts out of stock, so whatever the menus use becomes a
 * shortage; one gluten-free ingredient is then bought only from the vendor whose gluten-free
 * certificate is unverified. Tests pick their ingredients from the result instead of naming them,
 * so they keep working when seed data and recipes change.
 */
export function agentScenario(): AgentScenario {
  const base = initialState();
  const empty: KitchenState = {
    ...base,
    leadTimeDays: 1,
    ingredients: base.ingredients.map((i) => ({ ...i, stock: 0, onOrder: 0 })),
  };
  const gluten = new InventoryWorkspace(empty, reference).shortages.find((s) =>
    GLUTEN_FREE.includes(s.ingredientId),
  );
  if (!gluten) throw new Error("fixture: expected a gluten-free ingredient in the planned menus");
  const state: KitchenState = {
    ...empty,
    ingredients: empty.ingredients.map((i) =>
      i.id === gluten.ingredientId ? { ...i, vendor: "Hearth Bakery" } : i,
    ),
  };

  const ws = new InventoryWorkspace(state, reference);
  const withOutcome = (outcome: string) => {
    const found = ws.shortages.find((s) => ws.source(s.ingredientId)?.outcome === outcome);
    if (!found) throw new Error(`fixture: no shortage with outcome "${outcome}"`);
    return found;
  };
  const ok = withOutcome("ok");
  const slow = withOutcome("too-slow");
  const unverified = withOutcome("no-compliant-vendor");
  const okVendorId = ws.source(ok.ingredientId)?.recommended?.vendorId;
  const slowVendorId = ws
    .source(slow.ingredientId)
    ?.options.find((o) => o.compliance.status === "eligible")?.vendorId;
  if (!okVendorId || !slowVendorId)
    throw new Error("fixture: expected vendors for the ok and too-slow shortages");
  return { state, ok, okVendorId, slow, slowVendorId, unverified };
}
