import { describe, expect, it } from "vitest";
import { initialState } from "@/lib/kitchen/data";
import { reducer } from "@/lib/kitchen/store";
import { replayAt } from "@/lib/kitchen/shared-sync";

describe("shared kitchen log", () => {
  it("replays an action with the time it was made, so every device records the same decision", () => {
    const at = Date.UTC(2026, 10, 12, 9);
    const a = { type: "reject", proposalId: "p1", kind: "purchase", summary: "x" } as Parameters<typeof reducer>[1];
    const one = replayAt(initialState(), a, at, (s, x, r) => reducer(s, x, r));
    const two = replayAt(initialState(), a, at, (s, x, r) => reducer(s, x, r));
    expect(one.history[0]!.at).toBe(at);
    expect(two).toEqual(one);
  });
});
