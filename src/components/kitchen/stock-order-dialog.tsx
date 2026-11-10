import { useState } from "react";
import { useKitchen } from "@/lib/kitchen/store";
import { stockOrderEstimate, stockOrderSchema, stockVendors } from "@/lib/kitchen/stock-orders";
import type { Ingredient } from "@/lib/kitchen/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export function StockOrderDialog({ ingredient, demand, shortageDate, onClose }: { ingredient: Ingredient; demand: number; shortageDate?: string | undefined; onClose: () => void }) {
  const { state, dispatch } = useKitchen();
  const estimate = stockOrderEstimate(state, ingredient.id, demand);
  const [vendor, setVendor] = useState(ingredient.vendor);
  const [qty, setQty] = useState(String(estimate?.qty || ingredient.packSize));
  const vendors = stockVendors(state);
  const parsed = stockOrderSchema.safeParse({ ingredientId: ingredient.id, vendor, qty: Number(qty) });
  const valid = parsed.success && vendors.includes(vendor);
  if (!estimate) return null;
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Order {ingredient.name}</DialogTitle><DialogDescription>Record an incoming order. Stock changes only after delivery is confirmed.</DialogDescription></DialogHeader>
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (!valid || !parsed.success) return; dispatch({ type: "placeStockOrder", ...parsed.data }); toast.success("Order added to Incoming orders"); onClose(); }}>
      <label className="block space-y-2 text-sm font-medium"><span>Vendor</span><Select value={vendor} onValueChange={setVendor}><SelectTrigger aria-label="Order vendor"><SelectValue /></SelectTrigger><SelectContent>{vendors.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></label>
      <div className="text-sm">Suggested order: <strong>{estimate.qty} {ingredient.unit}</strong><p className="mt-1 text-muted-foreground">Based on {state.purchaseHorizonDays ?? 7}-day consumption, pack size, and incoming quantities.{!estimate.qty && " Existing incoming orders cover the period; a shortage may remain before they arrive."}</p></div>
      <label className="block space-y-2 text-sm font-medium"><span>Order amount ({ingredient.unit})</span><Input aria-label="Order amount" required type="number" min="0.001" max="100000" step="any" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
      {!valid && <p role="alert" className="text-sm text-destructive">Choose a listed vendor and a quantity greater than zero, up to 100,000.</p>}
      <div className="space-y-2 border-y py-4 text-sm"><p>Estimated price: ${ingredient.unitCost.toFixed(2)} / {ingredient.unit}</p><p className="font-semibold">Estimated total: ${valid ? (Number(qty) * ingredient.unitCost).toFixed(2) : "—"}</p><p>Estimated delivery: {new Date(`${estimate.deliveryDate}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · {state.leadTimeDays ?? 2} days</p><p className="text-xs text-muted-foreground">Inventory reference price and configured lead time; not a live vendor quote.</p></div>
      {shortageDate && shortageDate < estimate.deliveryDate && <p className="text-sm text-destructive">Delivery is after the first shortage. An available-stock alternative or transfer is still needed before arrival.</p>}
      <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!valid}>Confirm order</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}