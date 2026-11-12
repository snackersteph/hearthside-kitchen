import { describe, expect, it } from "vitest";
import { initialState } from "@/lib/kitchen/data";
import { analyzeMenuDay } from "@/lib/kitchen/engine";
import { bulkApprovalActions } from "@/lib/kitchen/bulk-approvals";
import { reducer } from "@/lib/kitchen/store";
import type { PurchaseProposal, SubstitutionProposal } from "@/lib/kitchen/types";

const reference = new Date("2026-11-10T12:00:00");
function setup() {
  const state = initialState();
  const proposals = analyzeMenuDay(state, 1, reference).proposals.filter((p): p is SubstitutionProposal => p.kind === "substitution");
  if (proposals.length < 2) throw new Error("Expected several meal requests");
  return { state, proposals };
}
describe("bulk approval", () => {
  it("approves all selected requests, leaving unselected requests pending", () => {
    const { state, proposals } = setup();
    const selected = proposals.slice(0, 2);
    const actions = bulkApprovalActions(state, selected, false, reference);
    const next = actions.reduce((s, action) => reducer(s, action, reference), state);
    expect(actions).toHaveLength(2);
    for (const p of selected) for (const id of p.residentIds) expect(next.scheduledOverrides?.["2026-11-11"]?.[p.meal]?.[id]).toBe(p.dishId);
    const remaining = proposals[2];
    if (!remaining) throw new Error("Expected an unselected request");
    expect(next.scheduledOverrides?.["2026-11-11"]?.[remaining.meal]?.[remaining.residentIds[0] ?? ""]).toBeUndefined();
  });
  it("does not approve overdue, unsafe, already approved or duplicate requests", () => {
    const { state, proposals } = setup();
    const p = proposals[0]; if (!p) throw new Error("Missing request");
    const resident = state.residents.find((r) => r.id === p.residentIds[0]); if (!resident) throw new Error("Missing resident");
    expect(bulkApprovalActions(state, [{ ...p, serviceDate: "2026-11-10" }, { ...p, id: "approved", approved: true }], false, reference)).toEqual([]);
    expect(bulkApprovalActions(state, [p, p], false, reference)).toHaveLength(1);
    const unsafe = { ...state, residents: state.residents.map((r) => r.id === resident.id ? { ...r, texture: "pureed" as const } : r) };
    // A missing resident is never an approvable dietary decision.
    expect(bulkApprovalActions(unsafe, [{ ...p, residentIds: ["missing-resident"] }], false, reference)).toEqual([]);
    expect(bulkApprovalActions(state, [{ ...p, dishId: p.fromDishId }], false, reference)).toEqual([]);
  });
  it("remembers meal choices only when explicitly selected", () => {
    const { state, proposals } = setup();
    const p = proposals[0]; if (!p) throw new Error("Missing request");
    const ordinary = bulkApprovalActions(state, [p], false, reference).reduce((s, a) => reducer(s, a, reference), state);
    const saved = bulkApprovalActions(state, [p], true, reference).reduce((s, a) => reducer(s, a, reference), state);
    expect(ordinary.alternativePreferences ?? []).toHaveLength(0);
    expect(saved.alternativePreferences).toHaveLength(p.residentIds.length);
  });
  it("bulk approved purchases stay incoming and do not add available stock", () => {
    const state = initialState();
    const ingredient = state.ingredients[0]; if (!ingredient) throw new Error("Missing ingredient");
    const proposals: PurchaseProposal[] = [1, 2].map((n) => ({ id: `bulk-order-${n}`, kind: "purchase", agent: "inventory", vendor: "Sysco", total: 10, deliveryDate: "2026-11-12", lines: [{ ingredientId: ingredient.id, qty: n, shortage: n }] }));
    const next = bulkApprovalActions(state, proposals, false, reference).reduce((s, a) => reducer(s, a, reference), state);
    expect(next.orders).toHaveLength(2);
    expect(next.orders?.every((o) => o.status === "incoming")).toBe(true);
    expect(next.ingredients[0]?.stock).toBe(ingredient.stock);
    expect(next.ingredients[0]?.onOrder).toBe(ingredient.onOrder + 3);
  });
});