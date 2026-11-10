import { useState } from "react";
import { ExternalLink, Eye, PackageCheck, Truck, MessageSquareWarning, RefreshCw, PackageX } from "lucide-react";
import { useKitchen } from "@/lib/kitchen/store";
import { dateKey } from "@/lib/kitchen/schedule";
import { groupIncomingOrders, vendorDestination, type VendorOrder } from "@/lib/kitchen/order-display";
import type { PurchaseOrder } from "@/lib/kitchen/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const deliveryLabel = (order: VendorOrder) => {
  const dates = order.sourceOrders.map((source) => source.deliveryDate).sort();
  const first = dates[0] ?? order.deliveryDate;
  const last = dates[dates.length - 1] ?? first;
  return first === last ? dateLabel(first) : `${dateLabel(first)} – ${dateLabel(last)}`;
};

export function InventoryOrders({ mode }: { mode: "delivered" | "incoming" }) {
  const { state, dispatch } = useKitchen();
  const [viewing, setViewing] = useState<VendorOrder | null>(null);
  const [vendorAction, setVendorAction] = useState<string | null>(null);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const orders: VendorOrder[] = mode === "incoming"
    ? groupIncomingOrders(state.orders ?? [])
    : (state.orders ?? []).filter((order) => order.status === "received" || order.deliveryDate <= dateKey(new Date()))
      .sort((a, b) => (a.status === "incoming" ? 0 : 1) - (b.status === "incoming" ? 0 : 1) || b.deliveryDate.localeCompare(a.deliveryDate))
      .map((order) => ({ ...order, sourceOrders: [order] }));
  return <section aria-label={mode === "incoming" ? "Incoming orders" : "Delivered orders"}>
    <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-semibold">{mode === "incoming" ? <Truck className="h-5 w-5" /> : <PackageCheck className="h-5 w-5" />}{mode === "incoming" ? "Incoming orders" : "Delivered orders"}</h2>
    {!orders.length ? <p className="border-y py-8 text-center text-muted-foreground">{mode === "incoming" ? "No incoming orders." : "No deliveries due or confirmed yet."}</p> : <div className="divide-y border-y">{orders.map((order) => <div key={order.id} className="flex flex-wrap items-center gap-4 py-5">
      <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
        <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{order.vendor}</h3><span className={order.status === "received" ? "text-xs text-success" : "text-xs text-warning"}>{order.status === "received" ? "Delivery confirmed" : mode === "delivered" ? "Awaiting delivery confirmation" : "Incoming"}</span></div>
        <p className="mt-1 text-sm text-muted-foreground">Expected {deliveryLabel(order)}{order.receivedAt ? ` · Confirmed ${new Date(order.receivedAt).toLocaleDateString()}` : ""}</p>
        <p className="mt-2 text-sm">{order.lines.map((line) => { const ingredient = state.ingredients.find((item) => item.id === line.ingredientId); return `${ingredient?.name ?? line.ingredientId}: ${line.qty} ${ingredient?.unit ?? ""}`; }).join(" · ")}</p>
      </div>
      <div className="flex flex-wrap gap-2 sm:max-w-lg"><Button variant="outline" onClick={() => { setVendorAction(null); setViewing(order); }}><Eye />View</Button>{mode === "delivered" && <><Button variant="outline" onClick={() => { setVendorAction("Report issue"); setViewing(order); }}><MessageSquareWarning />Report issue</Button><Button variant="outline" onClick={() => { setVendorAction("Request replacement"); setViewing(order); }}><RefreshCw />Request replacement</Button><Button variant="outline" className="text-destructive" onClick={() => { setVendorAction("Reject delivery"); setViewing(order); }}><PackageX />Reject delivery</Button></>}{mode === "delivered" && order.status === "incoming" && <Button onClick={() => setReceiving(order)}><PackageCheck />Confirm delivery</Button>}</div>
    </div>)}</div>}
    {viewing && <OrderDetails order={viewing} action={vendorAction} onClose={() => { setViewing(null); setVendorAction(null); }} />}
    <AlertDialog open={Boolean(receiving)} onOpenChange={(open) => !open && setReceiving(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirm delivery from {receiving?.vendor}?</AlertDialogTitle><AlertDialogDescription>Confirm only after these ingredients have arrived. The quantities below will be added to food stock and removed from incoming quantities.</AlertDialogDescription></AlertDialogHeader><ul className="space-y-2 text-sm">{receiving?.lines.map((line) => { const ingredient = state.ingredients.find((item) => item.id === line.ingredientId); return <li key={line.ingredientId}>{ingredient?.name ?? line.ingredientId} · {line.qty} {ingredient?.unit}</li>; })}</ul><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction asChild><Button onClick={() => { if (!receiving) return; dispatch({ type: "receiveOrder", id: receiving.id }); toast.success("Delivery confirmed — food stock updated"); setReceiving(null); }}>Confirm delivery</Button></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}

function OrderDetails({ order, action, onClose }: { order: VendorOrder; action: string | null; onClose: () => void }) {
  const { state } = useKitchen();
  const destination = vendorDestination(order.vendor);
  const total = order.lines.reduce((sum, line) => sum + line.qty * (state.ingredients.find((item) => item.id === line.ingredientId)?.unitCost ?? 0), 0);
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[90vh] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
    <DialogHeader><DialogTitle>{action ?? "Order details"}</DialogTitle><DialogDescription>{order.vendor} · {order.status === "incoming" ? "Incoming" : "Delivered"}{action ? " · Not sent to vendor" : ""}</DialogDescription></DialogHeader>
    <div className="space-y-5">
      <dl className="grid gap-4 sm:grid-cols-2"><div><dt className="text-sm text-muted-foreground">Vendor</dt><dd className="font-semibold">{order.vendor}</dd></div><div><dt className="text-sm text-muted-foreground">Expected delivery</dt><dd className="text-sm font-medium">{deliveryLabel(order)}</dd></div></dl>
      <div className="overflow-x-auto border-y"><table className="w-full text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="py-3 pr-4">Ingredient</th><th className="py-3 pr-4 text-right">Quantity</th><th className="py-3 pr-4">Expected</th><th className="py-3 text-right">Est. cost</th></tr></thead><tbody className="divide-y">{order.lines.map((line) => {
        const ingredient = state.ingredients.find((item) => item.id === line.ingredientId);
        const dates = [...new Set(order.sourceOrders.filter((source) => source.lines.some((item) => item.ingredientId === line.ingredientId)).map((source) => source.deliveryDate))].sort();
        return <tr key={line.ingredientId}><td className="py-3 pr-4 font-medium">{ingredient?.name ?? line.ingredientId}</td><td className="whitespace-nowrap py-3 pr-4 text-right">{line.qty} {ingredient?.unit}</td><td className="py-3 pr-4 text-muted-foreground">{dates.map(dateLabel).join(" · ")}</td><td className="py-3 text-right">${(line.qty * (ingredient?.unitCost ?? 0)).toFixed(2)}</td></tr>;
      })}</tbody></table></div>
      <p className="text-right text-sm font-semibold">Estimated total: ${total.toFixed(2)}</p>
      <div className="border-t pt-4"><p className="mb-3 text-sm text-muted-foreground">{action === "Report issue" ? `Report damaged, missing, or incorrect ingredients to ${order.vendor}.` : action === "Request replacement" ? `Request replacement ingredients from ${order.vendor}.` : action === "Reject delivery" ? `Arrange delivery rejection or return with ${order.vendor}. Stock remains unchanged until delivery is confirmed.` : "Contact the vendor for order changes or delivery issues."}{destination.label === "Find vendor website" ? " A verified website has not been added for this vendor; this link opens a website search." : ""}</p><Button asChild variant="outline"><a href={destination.url} target="_blank" rel="noopener noreferrer"><ExternalLink />Contact vendor</a></Button></div>
    </div>
    <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
  </DialogContent></Dialog>;
}
