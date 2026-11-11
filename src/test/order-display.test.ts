import { describe, expect, it } from "vitest";
import { groupIncomingOrders } from "@/lib/kitchen/order-display";
import type { PurchaseOrder } from "@/lib/kitchen/types";

describe("incoming vendor order display", () => {
  const orders: PurchaseOrder[] = [
    { id: "1", vendor: "Valley Farms", status: "incoming", deliveryDate: "2026-11-08", lines: [{ ingredientId: "carrots", qty: 5, shortage: 0 }] },
    { id: "2", vendor: "Valley Farms", status: "incoming", deliveryDate: "2026-11-09", lines: [{ ingredientId: "milk", qty: 4, shortage: 0 }] },
    { id: "3", vendor: "Valley Farms", status: "incoming", deliveryDate: "2026-11-11", lines: [{ ingredientId: "vegetables", qty: 20, shortage: 0 }] },
  ];
  it("combines the three Valley Farms orders into one with every item and original delivery date", () => {
    const grouped = groupIncomingOrders(orders);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.lines.map(({ ingredientId, qty }) => [ingredientId, qty])).toEqual([["carrots", 5], ["milk", 4], ["vegetables", 20]]);
    expect(grouped[0]?.sourceOrders.map((order) => order.deliveryDate)).toEqual(["2026-11-08", "2026-11-09", "2026-11-11"]);
    expect(orders[0]?.lines).toEqual([{ ingredientId: "carrots", qty: 5, shortage: 0 }]);
  });
  it("keeps vendors separate and excludes received orders", () => {
    expect(groupIncomingOrders([...orders, { ...orders[0] as PurchaseOrder, id: "4", vendor: "Sysco" }, { ...orders[0] as PurchaseOrder, id: "5", vendor: "Other", status: "received" }]).map((order) => order.vendor)).toEqual(["Valley Farms", "Sysco"]);
  });
});