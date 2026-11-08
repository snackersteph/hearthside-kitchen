import { describe, expect, it } from "vitest";
import { analyze, conflictReasons } from "@/lib/kitchen/engine";
import { initialState, dishById } from "@/lib/kitchen/data";
import { reducer } from "@/lib/kitchen/store";

describe("kitchen agents", () => {
  it("dietary agent flags dairy residents for the alfredo", () => {
    const s = initialState();
    const flagged = analyze(s).conflicts.filter((c) => c.meal === "lunch" && c.reasons.includes("contains dairy")).map((c) => c.residentId).sort();
    expect(flagged).toEqual(["r1", "r12", "r7"]);
  });

  it("menu agent only proposes dishes safe for every covered resident", () => {
    const s = initialState();
    for (const p of analyze(s).proposals) {
      if (p.kind !== "substitution") continue;
      for (const id of p.residentIds) expect(conflictReasons(s.residents.find((r) => r.id === id)!, dishById(p.dishId))).toEqual([]);
    }
  });

  it("approving a swap resolves the conflict and approving an order clears the shortage", () => {
    let s = initialState();
    for (const p of analyze(s).proposals.filter((p) => p.kind === "substitution"))
      if (p.kind === "substitution") s = reducer(s, { type: "approveSub", proposalId: p.id, meal: p.meal, dishId: p.dishId, residentIds: p.residentIds, modified: false, summary: "" });
    expect(analyze(s).conflicts.length).toBe(0);
    for (const p of analyze(s).proposals)
      if (p.kind === "purchase") s = reducer(s, { type: "approvePurchase", proposalId: p.id, lines: p.lines, modified: false, summary: "" });
    expect(analyze(s).proposals.length).toBe(0);
  });
});
