import type { PurchaseOrder } from "./types";

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