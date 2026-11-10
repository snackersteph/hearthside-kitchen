import { z } from "zod";
import type { KitchenState } from "./types";
import { dateKey, dayAt } from "./schedule";

export const stockOrderSchema = z.object({
  ingredientId: z.string().trim().min(1).max(100),
  vendor: z.string().trim().min(1).max(100),
  qty: z.number().finite().positive().max(100000),
});

export function stockVendors(state: KitchenState) {
  return [...new Set(state.ingredients.map((i) => i.vendor))].sort();
}

export function stockOrderEstimate(state: KitchenState, ingredientId: string, demand: number, reference = new Date()) {
  const ingredient = state.ingredients.find((i) => i.id === ingredientId);
  if (!ingredient) return null;
  const end = dateKey(dayAt((state.purchaseHorizonDays ?? 7) - 1, reference));
  const incoming = (state.orders ?? []).filter((o) => o.status === "incoming").flatMap((o) => o.lines.filter((l) => l.ingredientId === ingredientId).map((l) => ({ qty: l.qty, date: o.deliveryDate })));
  const tracked = incoming.reduce((sum, l) => sum + l.qty, 0);
  const deliveryDate = dateKey(dayAt(Math.max(1, state.leadTimeDays ?? 2), reference));
  const arriving = incoming.filter((l) => l.date <= end).reduce((sum, l) => sum + l.qty, 0) + (deliveryDate <= end ? Math.max(0, ingredient.onOrder - tracked) : 0);
  const shortage = Math.max(0, demand - ingredient.stock - arriving);
  const pack = Math.max(0.001, ingredient.packSize);
  const qty = Math.round(Math.ceil(shortage / pack) * pack * 1000) / 1000;
  return { qty, shortage, deliveryDate, unitCost: ingredient.unitCost };
}