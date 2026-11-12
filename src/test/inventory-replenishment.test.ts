import { describe, expect, it } from "vitest";
import { initialState } from "@/lib/kitchen/data";
import { analyzeMenuDay } from "@/lib/kitchen/engine";
import { migrateInventoryReplenishment } from "@/lib/kitchen/inventory-replenishment";

const reference = new Date("2026-11-12T12:00:00");

describe("showcase inventory replenishment", () => {
  it("stores enough ingredients for at least eleven days without relying on incoming orders", () => {
    const base = initialState();
    base.ingredients = base.ingredients.map((i) => ({ ...i, stock: 0, onOrder: 1000 }));
    const next = migrateInventoryReplenishment(base, reference);
    const demand: Record<string, number> = {};
    for (let offset = 0; offset < 11; offset++) {
      for (const [id, qty] of Object.entries(analyzeMenuDay(next, offset, reference).demand)) demand[id] = (demand[id] ?? 0) + qty;
    }
    expect(Object.values(demand).reduce((sum, qty) => sum + qty, 0)).toBeGreaterThan(0);
    for (const [id, qty] of Object.entries(demand)) {
      expect(next.ingredients.find((i) => i.id === id)?.stock).toBeGreaterThanOrEqual(Math.round(qty * 100) / 100);
    }
  });

  it("only increases stored quantities and preserves orders, vendors and staff decisions", () => {
    const base = initialState();
    const next = migrateInventoryReplenishment(base, reference);
    expect(next.orders).toBe(base.orders);
    expect(next.history).toBe(base.history);
    expect(next.scheduledPlans).toBe(base.scheduledPlans);
    for (const ingredient of base.ingredients) {
      const updated = next.ingredients.find((i) => i.id === ingredient.id);
      expect(updated?.stock).toBeGreaterThanOrEqual(ingredient.stock);
      expect(updated && { ...updated, stock: ingredient.stock }).toEqual(ingredient);
    }
  });

  it("runs once so later consumption and stock edits are not overwritten", () => {
    const next = migrateInventoryReplenishment(initialState(), reference);
    next.ingredients = next.ingredients.map((i) => ({ ...i, stock: 0 }));
    expect(migrateInventoryReplenishment(next, reference)).toBe(next);
    expect(next.ingredients.every((i) => i.stock === 0)).toBe(true);
  });
});