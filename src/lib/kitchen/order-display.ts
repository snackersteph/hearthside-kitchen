import type { Decision, KitchenState, PurchaseOrder, PurchaseProposal } from "./types";

/** Legacy approvals can resolve their exact source order, never another order from the same vendor. */
export function historicalPurchase(state: KitchenState, decision: Decision): PurchaseProposal | undefined {
  if (decision.kind !== "purchase") return undefined;
  if (decision.purchaseDetails) return decision.purchaseDetails;
  if (decision.status !== "approved") return undefined;
  const order = state.orders?.find((o) => o.id === decision.proposalId || (o.id.startsWith(`${decision.proposalId}-`) && /^\d+$/.test(o.id.slice(decision.proposalId.length + 1))));
  if (!order) return undefined;
  return { id: decision.proposalId, kind: "purchase", agent: "inventory", vendor: order.vendor, lines: order.lines, deliveryDate: order.deliveryDate, ...(order.serviceWeekId ? { serviceWeekId: order.serviceWeekId } : {}),
    total: order.lines.reduce((sum, line) => sum + line.qty * (state.ingredients.find((i) => i.id === line.ingredientId)?.unitCost ?? 0), 0) };
}

export interface VendorOrder extends PurchaseOrder {
  sourceOrders: PurchaseOrder[];
}

// Group for display only: individual delivery dates remain intact for forecasts.
export function groupIncomingOrders(orders: PurchaseOrder[]): VendorOrder[] {
  const groups = new Map<string, VendorOrder>();
  for (const order of orders) {
    if (order.status !== "incoming") continue;
    const key = order.vendor.trim().toLowerCase();
    const group = groups.get(key);
    if (!group) {
      groups.set(key, { ...order, vendor: order.vendor.trim(), lines: order.lines.map((line) => ({ ...line })), sourceOrders: [order] });
      continue;
    }
    group.sourceOrders.push(order);
    if (order.deliveryDate < group.deliveryDate) group.deliveryDate = order.deliveryDate;
    for (const line of order.lines) {
      const existing = group.lines.find((item) => item.ingredientId === line.ingredientId);
      if (existing) {
        existing.qty += line.qty;
        existing.shortage += line.shortage;
      } else group.lines.push({ ...line });
    }
  }
  return [...groups.values()].sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
}

export function vendorDestination(vendor: string) {
  const known: Record<string, string> = {
    sysco: "https://shop.sysco.com/",
    "pacific seafood": "https://www.pacificseafood.com/",
  };
  const url = known[vendor.trim().toLowerCase()];
  return url
    ? { url, label: "Open vendor website / app" }
    : { url: `https://www.google.com/search?q=${encodeURIComponent(`${vendor} food supplier official website`)}`, label: "Find vendor website" };
}