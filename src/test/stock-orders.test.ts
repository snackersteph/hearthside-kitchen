import { describe, expect, it } from "vitest";
import { initialState } from "@/lib/kitchen/data";
import { reducer } from "@/lib/kitchen/store";
import { stockOrderEstimate } from "@/lib/kitchen/stock-orders";

const reference = new Date("2026-11-10T12:00:00");
describe("stock alert orders", () => {
  it("suggests pack-rounded quantities after accounting for stock and incoming orders", () => {
    const s = initialState();
    expect(stockOrderEstimate(s, "chicken", 15, reference)?.qty).toBe(12);
    const next = reducer(s, { type: "placeStockOrder", ingredientId: "chicken", vendor: "Sysco", qty: 12 }, reference);
    expect(stockOrderEstimate(next, "chicken", 15, reference)?.qty).toBe(0);
  });
  it("records the selected vendor, quantity and delivery estimate without adding stock", () => {
    const s = initialState();
    const next = reducer(s, { type: "placeStockOrder", ingredientId: "chicken", vendor: "Valley Farms", qty: 12 }, reference);
    expect(next.orders?.at(-1)).toMatchObject({ vendor: "Valley Farms", deliveryDate: "2026-11-12", status: "incoming", lines: [{ ingredientId: "chicken", qty: 12 }] });
    expect(next.ingredients.find((i) => i.id === "chicken")).toMatchObject({ stock: 6, onOrder: 12 });
    const id = next.orders?.at(-1)?.id;
    if (!id) throw new Error("Missing order");
    expect(reducer(next, { type: "receiveOrder", id }, reference).ingredients.find((i) => i.id === "chicken")?.stock).toBe(18);
  });
  it("rejects unknown vendors, unknown ingredients and invalid quantities", () => {
    const s = initialState();
    for (const qty of [0, -1, NaN, Infinity, 100001]) expect(reducer(s, { type: "placeStockOrder", ingredientId: "chicken", vendor: "Sysco", qty }, reference)).toBe(s);
    expect(reducer(s, { type: "placeStockOrder", ingredientId: "chicken", vendor: "Unknown", qty: 2 }, reference)).toBe(s);
    expect(reducer(s, { type: "placeStockOrder", ingredientId: "missing", vendor: "Sysco", qty: 2 }, reference)).toBe(s);
  });
});