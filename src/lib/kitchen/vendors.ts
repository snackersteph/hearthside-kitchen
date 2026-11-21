import type { KitchenState, PurchaseProposal, Vendor } from "./types";
import { historicalPurchase, vendorDestination } from "./order-display";
import { activeWeeklyPurchasing } from "./weekly-purchasing";

export const vendorKey = (name: string) => name.trim().toLowerCase();
export const vendorId = (name: string) => `vendor-${vendorKey(name)}`;
export function vendorMatches(vendor: Vendor, name: string) {
  return [vendor.name, ...vendor.aliases].some((alias) => vendorKey(alias) === vendorKey(name));
}
export function vendorDirectory(state: KitchenState, includeDeleted = false): Vendor[] {
  const saved = state.vendors ?? [];
  const names = [...state.ingredients.map((i) => i.vendor), ...(state.orders ?? []).map((o) => o.vendor), ...state.history.flatMap((h) => h.purchaseDetails ? [h.purchaseDetails.vendor] : [])];
  const result = [...saved];
  for (const name of names) {
    if (!name.trim() || result.some((v) => vendorMatches(v, name))) continue;
    const destination = vendorDestination(name);
    result.push({ id: vendorId(name), name: name.trim(), aliases: [name.trim()], contactName: "", email: "", phone: "", address: "", website: destination.label === "Find vendor website" ? "" : destination.url, notes: "" });
  }
  return result.filter((v) => includeDeleted || !(state.deletedVendorIds ?? []).includes(v.id)).sort((a, b) => a.name.localeCompare(b.name));
}
export function findVendor(state: KitchenState, name: string) {
  return vendorDirectory(state, true).find((v) => vendorMatches(v, name));
}
export function validVendor(vendor: Vendor) {
  if (!vendor.id || !vendor.name.trim() || vendor.name.trim().length > 100) return false;
  if (vendor.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(vendor.email)) return false;
  if (vendor.website) {
    try { if (!["https:", "http:"].includes(new URL(vendor.website).protocol)) return false; } catch { return false; }
  }
  return true;
}
export function saveVendor(state: KitchenState, vendor: Vendor): KitchenState {
  const previous = vendorDirectory(state, true).find((v) => v.id === vendor.id);
  const next = { ...vendor, name: vendor.name.trim(), aliases: [...new Set([...(previous?.aliases ?? []), ...(previous ? [previous.name] : []), vendor.name.trim()])] };
  if (!validVendor(next) || vendorDirectory(state, true).some((v) => v.id !== next.id && next.aliases.some((a) => vendorMatches(v, a)))) return state;
  return { ...state, vendors: [...(state.vendors ?? []).filter((v) => v.id !== next.id), next], deletedVendorIds: (state.deletedVendorIds ?? []).filter((id) => id !== next.id) };
}
export function deleteVendor(state: KitchenState, id: string): KitchenState {
  if (!vendorDirectory(state).some((v) => v.id === id)) return state;
  const vendor = vendorDirectory(state).find((v) => v.id === id);
  if (!vendor) return state;
  const tombstone = { ...vendor, contactName: "", email: "", phone: "", address: "", website: "", notes: "" };
  return { ...state, vendors: [...(state.vendors ?? []).filter((v) => v.id !== id), tombstone], deletedVendorIds: [...(state.deletedVendorIds ?? []), id] };
}
export interface VendorPurchase { id: string; proposal: PurchaseProposal; status: string; at?: number }
export function vendorPurchases(state: KitchenState, reference: Date): VendorPurchase[] {
  const entries: VendorPurchase[] = (state.orders ?? []).map((o) => ({ id: o.id, status: o.status === "received" ? "Delivered" : "Incoming", proposal: { id: o.id, kind: "purchase", agent: "inventory", vendor: o.vendor, lines: o.lines, deliveryDate: o.deliveryDate, ...(o.serviceWeekId ? { serviceWeekId: o.serviceWeekId } : {}), total: o.lines.reduce((sum, l) => sum + l.qty * (state.ingredients.find((i) => i.id === l.ingredientId)?.unitCost ?? 0), 0) } }));
  for (const h of state.history) {
    const p = historicalPurchase(state, h);
    if (!p || entries.some((e) => e.id === p.id || (e.id.startsWith(`${p.id}-`) && /^\d+$/.test(e.id.slice(p.id.length + 1))))) continue;
    entries.push({ id: p.id, proposal: p, status: h.status === "approved" ? "Approved" : "Rejected", at: h.at });
  }
  for (const week of activeWeeklyPurchasing(state, reference)) for (const p of week.proposals) {
    if (!entries.some((e) => e.id === p.id)) entries.push({ id: p.id, proposal: p, status: "Awaiting approval" });
  }
  return entries.sort((a, b) => (b.proposal.deliveryDate ?? "").localeCompare(a.proposal.deliveryDate ?? ""));
}