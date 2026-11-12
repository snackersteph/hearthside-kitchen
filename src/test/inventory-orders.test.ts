import { describe, expect, it } from "vitest";
import { initialState } from "@/lib/kitchen/data";
import { reducer } from "@/lib/kitchen/store";

const reference = new Date("2026-11-09T12:00:00");
function ordered() {
  const base = initialState();
  base.ingredients = base.ingredients.map((i) => (i.id === "chicken" ? { ...i, stock: 6 } : i));
  return reducer(base, { type: "approvePurchase", proposalId: "order-test", vendor: "Sysco", deliveryDate: "2026-11-09", lines: [{ ingredientId: "chicken", qty: 8, shortage: 8 }], modified: false, summary: "Order" }, reference);
}
function orderId(s: ReturnType<typeof ordered>) { const id = s.orders?.[0]?.id; if (!id) throw new Error("Missing order"); return id; }

describe("inventory order management", () => {
  it("deletes an unconfirmed order without changing stock and removes its incoming quantities", () => {
    const s = ordered();
    const next = reducer(s, { type: "deleteOrder", id: orderId(s) }, reference);
    expect(next.orders).toEqual([]);
    expect(next.ingredients.find((i) => i.id === "chicken")?.stock).toBe(6);
    expect(next.ingredients.find((i) => i.id === "chicken")?.onOrder).toBe(0);
  });
  it("deletes a confirmed order without reversing received stock", () => {
    const s = ordered(); const id = orderId(s);
    const received = reducer(s, { type: "receiveOrder", id }, reference);
    const next = reducer(received, { type: "deleteOrder", id }, reference);
    expect(next.orders).toEqual([]);
    expect(next.ingredients.find((i) => i.id === "chicken")?.stock).toBe(14);
    expect(next.ingredients.find((i) => i.id === "chicken")?.onOrder).toBe(0);
  });
  it("edits incoming quantities, vendor and delivery without adding to stock", () => {
    const s = ordered();
    const next = reducer(s, { type: "updateOrder", id: orderId(s), vendor: "Valley Farms", deliveryDate: "2026-11-12", lines: [{ ingredientId: "chicken", qty: 4, shortage: 8 }] }, reference);
    expect(next.ingredients.find((i) => i.id === "chicken")?.stock).toBe(6);
    expect(next.ingredients.find((i) => i.id === "chicken")?.onOrder).toBe(4);
    expect(next.orders?.[0]).toMatchObject({ vendor: "Valley Farms", deliveryDate: "2026-11-12", lines: [{ ingredientId: "chicken", qty: 4, shortage: 8 }] });
  });
  it("adds and removes order ingredients while preserving other incoming quantities", () => {
    const s = ordered();
    const next = reducer(s, { type: "updateOrder", id: orderId(s), vendor: "Sysco", deliveryDate: "2026-11-10", lines: [{ ingredientId: "milk", qty: 2, shortage: 0 }] }, reference);
    expect(next.ingredients.find((i) => i.id === "chicken")?.onOrder).toBe(0);
    expect(next.ingredients.find((i) => i.id === "milk")?.onOrder).toBe((s.ingredients.find((i) => i.id === "milk")?.onOrder ?? 0) + 2);
  });
  it("confirms delivery once and archives its timestamp", () => {
    const s = ordered(); const id = orderId(s);
    const received = reducer(s, { type: "receiveOrder", id }, reference);
    expect(received.ingredients.find((i) => i.id === "chicken")?.stock).toBe(14);
    expect(received.ingredients.find((i) => i.id === "chicken")?.onOrder).toBe(0);
    expect(received.orders?.[0]).toMatchObject({ status: "received", receivedAt: reference.getTime() });
    expect(reducer(received, { type: "receiveOrder", id }, reference)).toBe(received);
  });
  it("prevents changes to delivered orders", () => {
    const s = ordered(); const id = orderId(s); const received = reducer(s, { type: "receiveOrder", id }, reference);
    expect(reducer(received, { type: "updateOrder", id, vendor: "Other", deliveryDate: "2026-11-10", lines: [{ ingredientId: "chicken", qty: 50, shortage: 0 }] }, reference)).toBe(received);
  });
  it("rejects invalid or empty incoming order changes", () => {
    const s = ordered(); const base = { type: "updateOrder" as const, id: orderId(s), vendor: "Sysco", deliveryDate: "2026-11-10" };
    for (const lines of [[], [{ ingredientId: "chicken", qty: -1, shortage: 0 }], [{ ingredientId: "missing", qty: 1, shortage: 0 }]]) expect(reducer(s, { ...base, lines }, reference)).toBe(s);
    expect(reducer(s, { ...base, deliveryDate: "2026-02-31", lines: [{ ingredientId: "chicken", qty: 1, shortage: 0 }] }, reference)).toBe(s);
  });
});