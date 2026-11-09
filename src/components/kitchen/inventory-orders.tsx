import { useState } from "react";
import { PackageCheck, Pencil, Plus, Trash2, Truck } from "lucide-react";
import { useKitchen } from "@/lib/kitchen/store";
import { dateKey } from "@/lib/kitchen/schedule";
import type { PurchaseOrder } from "@/lib/kitchen/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export function InventoryOrders({ mode }: { mode: "delivered" | "incoming" }) {
  const { state, dispatch } = useKitchen();
  const [viewing, setViewing] = useState<PurchaseOrder | null>(null);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const orders = (state.orders ?? []).filter((o) => mode === "incoming" ? o.status === "incoming" : o.status === "received" || o.deliveryDate <= dateKey(new Date()))
    .sort((a, b) => mode === "delivered" ? (a.status === "incoming" ? 0 : 1) - (b.status === "incoming" ? 0 : 1) || b.deliveryDate.localeCompare(a.deliveryDate) : a.deliveryDate.localeCompare(b.deliveryDate));
  return <section aria-label={mode === "incoming" ? "Incoming orders" : "Delivered orders"}>
    <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-semibold">{mode === "incoming" ? <Truck className="h-5 w-5" /> : <PackageCheck className="h-5 w-5" />}{mode === "incoming" ? "Incoming orders" : "Delivered orders"}</h2>
    {!orders.length ? <p className="border-y py-8 text-center text-muted-foreground">{mode === "incoming" ? "No incoming orders." : "No deliveries due or confirmed yet."}</p> : <div className="divide-y border-y">{orders.map((order) => <div key={order.id} className="flex flex-wrap items-center gap-4 py-5">
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{order.vendor}</h3><span className={order.status === "received" ? "text-xs text-success" : "text-xs text-warning"}>{order.status === "received" ? "Delivery confirmed" : mode === "delivered" ? "Awaiting delivery confirmation" : "Incoming"}</span></div><p className="mt-1 text-sm text-muted-foreground">Expected {dateLabel(order.deliveryDate)}{order.receivedAt ? ` · Confirmed ${new Date(order.receivedAt).toLocaleDateString()}` : ""}</p><p className="mt-2 text-sm">{order.lines.map((line) => { const ingredient = state.ingredients.find((i) => i.id === line.ingredientId); return `${ingredient?.name ?? line.ingredientId}: ${line.qty} ${ingredient?.unit ?? ""}`; }).join(" · ")}</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setViewing(order)}>{order.status === "incoming" ? <Pencil /> : <Truck />}{order.status === "incoming" ? "View / edit order" : "View details"}</Button>{order.status === "incoming" && <Button onClick={() => setReceiving(order)}><PackageCheck />Confirm delivery</Button>}</div>
    </div>)}</div>}
    {viewing && <OrderDetails key={viewing.id} order={viewing} onClose={() => setViewing(null)} />}
    <AlertDialog open={Boolean(receiving)} onOpenChange={(open) => !open && setReceiving(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirm delivery from {receiving?.vendor}?</AlertDialogTitle><AlertDialogDescription>Confirm only after these ingredients have arrived. The quantities below will be added to food stock and removed from incoming quantities.</AlertDialogDescription></AlertDialogHeader><ul className="space-y-2 text-sm">{receiving?.lines.map((l) => { const i = state.ingredients.find((i) => i.id === l.ingredientId); return <li key={l.ingredientId}>{i?.name ?? l.ingredientId} · {l.qty} {i?.unit}</li>; })}</ul><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction asChild><Button onClick={() => { if (!receiving) return; dispatch({ type: "receiveOrder", id: receiving.id }); toast.success("Delivery confirmed — food stock updated"); setReceiving(null); }}>Confirm delivery</Button></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}

function OrderDetails({ order, onClose }: { order: PurchaseOrder; onClose: () => void }) {
  const { state, dispatch } = useKitchen();
  const [draft, setDraft] = useState(order);
  const [confirming, setConfirming] = useState(false);
  const editable = order.status === "incoming";
  const valid = draft.vendor.trim() && draft.deliveryDate && draft.lines.length > 0 && draft.lines.every((l) => Number.isFinite(l.qty) && l.qty > 0);
  const available = state.ingredients.filter((i) => !draft.lines.some((l) => l.ingredientId === i.id));
  const total = draft.lines.reduce((n, l) => n + l.qty * (state.ingredients.find((i) => i.id === l.ingredientId)?.unitCost ?? 0), 0);
  return <><Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[90vh] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{editable ? "Order details & changes" : "Delivered order details"}</DialogTitle><DialogDescription>Order {order.id}</DialogDescription></DialogHeader>
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (valid) setConfirming(true); }}>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Vendor<Input aria-label="Order vendor" required disabled={!editable} value={draft.vendor} onChange={(e) => setDraft({ ...draft, vendor: e.target.value })} /></label><label className="text-sm font-medium">Expected delivery<Input aria-label="Expected delivery" type="date" required disabled={!editable} value={draft.deliveryDate} onChange={(e) => setDraft({ ...draft, deliveryDate: e.target.value })} /></label></div>
      <div className="divide-y border-y">{draft.lines.map((line) => { const ingredient = state.ingredients.find((i) => i.id === line.ingredientId); return <div key={line.ingredientId} className="flex items-center gap-3 py-3"><span className="min-w-0 flex-1 text-sm font-medium">{ingredient?.name ?? line.ingredientId}</span><Input className="w-24" aria-label={`Quantity for ${ingredient?.name ?? line.ingredientId}`} required type="number" min={0.001} step="any" disabled={!editable} value={line.qty} onChange={(e) => setDraft({ ...draft, lines: draft.lines.map((l) => l.ingredientId === line.ingredientId ? { ...l, qty: Number(e.target.value) } : l) })} /><span className="w-8 text-sm text-muted-foreground">{ingredient?.unit}</span>{editable && <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${ingredient?.name}`} onClick={() => setDraft({ ...draft, lines: draft.lines.filter((l) => l.ingredientId !== line.ingredientId) })}><Trash2 /></Button>}</div>; })}</div>
      {editable && available.length > 0 && <Select value="" onValueChange={(id) => setDraft({ ...draft, lines: [...draft.lines, { ingredientId: id, qty: 1, shortage: 0 }] })}><SelectTrigger aria-label="Add ingredient to order"><span className="flex items-center gap-2"><Plus className="h-4 w-4" /><SelectValue placeholder="Add ingredient" /></span></SelectTrigger><SelectContent>{available.map((i) => <SelectItem key={i.id} value={i.id}>{i.name} ({i.unit})</SelectItem>)}</SelectContent></Select>}
      <p className="text-sm font-semibold">Estimated total: ${total.toFixed(2)}</p>
      <DialogFooter><Button type="button" variant="outline" onClick={onClose}>{editable ? "Cancel" : "Close"}</Button>{editable && <Button type="submit" disabled={!valid}>Save changes</Button>}</DialogFooter>
    </form>
  </DialogContent></Dialog><AlertDialog open={confirming} onOpenChange={setConfirming}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Save order changes?</AlertDialogTitle><AlertDialogDescription>{draft.vendor} · Expected {dateLabel(draft.deliveryDate)} · {draft.lines.length} ingredients · Estimated ${total.toFixed(2)}. Incoming quantities and forecasts will update; current stock will not change.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction asChild><Button onClick={() => { dispatch({ type: "updateOrder", id: order.id, vendor: draft.vendor, deliveryDate: draft.deliveryDate, lines: draft.lines }); toast.success("Order updated"); onClose(); }}>Confirm save</Button></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}