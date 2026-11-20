import { describe, expect, it } from "vitest";
import { initialState } from "@/lib/kitchen/data";
import { historicalPurchase } from "@/lib/kitchen/order-display";
import { reducer } from "@/lib/kitchen/store";
import type { Decision, PurchaseProposal } from "@/lib/kitchen/types";

const reference = new Date("2026-11-20T07:52:00Z");
const proposal: PurchaseProposal = { id: "detail-order", kind: "purchase", agent: "inventory", vendor: "Sysco", deliveryDate: "2026-11-23", lines: [{ ingredientId: "chicken", qty: 8, shortage: 6 }], total: 80 };

describe("purchase order details", () => {
  it("retains approved quantities after the order is deleted and uses the approval time", () => {
    const approved = reducer(initialState(), { type: "approvePurchase", proposalId: proposal.id, vendor: proposal.vendor, lines: proposal.lines, deliveryDate: "2026-11-23", modified: false, summary: "Approved Sysco order" }, reference);
    const decision = approved.history[0];
    const order = approved.orders?.[0];
    if (!decision || !order) throw new Error("Missing approved order");
    const deleted = reducer(approved, { type: "deleteOrder", id: order.id }, reference);
    expect(historicalPurchase(deleted, decision)?.lines).toEqual([{ ingredientId: "chicken", qty: 8, shortage: 6 }]);
    expect(decision.at).toBe(Date.parse("2026-11-20T07:52:00Z"));
    expect(historicalPurchase(deleted, decision)?.deliveryDate).toBe("2026-11-23");
  });
  it("retains rejected request details without placing an incoming order", () => {
    const rejected = reducer(initialState(), { type: "reject", proposalId: proposal.id, kind: "purchase", summary: "Rejected Sysco order", purchaseDetails: proposal }, reference);
    const decision = rejected.history[0];
    if (!decision) throw new Error("Missing rejection");
    expect(historicalPurchase(rejected, decision)).toEqual(proposal);
    expect(rejected.orders ?? []).toHaveLength(0);
    expect(decision.at).toBe(reference.getTime());
  });
  it("matches legacy history to its exact order instead of a similar ID or vendor", () => {
    const state = initialState();
    const decision: Decision = { proposalId: "old-order", kind: "purchase", status: "approved", at: reference.getTime(), summary: "Approved", modified: false };
    state.orders = [{ id: "old-order-other-2", vendor: "Sysco", deliveryDate: "2026-11-23", status: "incoming", lines: [{ ingredientId: "chicken", qty: 50, shortage: 50 }] }, { id: "old-order-12", vendor: "Sysco", deliveryDate: "2026-11-23", status: "received", lines: proposal.lines }];
    expect(historicalPurchase(state, decision)?.lines[0]?.qty).toBe(8);
    expect(historicalPurchase(state, { ...decision, proposalId: "missing" })).toBeUndefined();
  });
});