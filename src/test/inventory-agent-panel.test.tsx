import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InventoryAgentResultView } from "@/components/kitchen/inventory-agent-panel";
import { initialState } from "@/lib/kitchen/data";
import {
  findShortages,
  runInventoryAgent,
  type DraftPurchaseRequest,
} from "@/lib/kitchen/inventory-agent";
import { reducer } from "@/lib/kitchen/store";
import type { KitchenState } from "@/lib/kitchen/types";
import { agentScenario, reference } from "./agent-fixtures";

afterEach(cleanup);

const setup = async (
  overrides: {
    decided?: Record<string, "approved" | "rejected">;
    open?: Set<string>;
    state?: KitchenState;
  } = {},
) => {
  const state = overrides.state ?? initialState();
  const result = await runInventoryAgent(state, { reference });
  const onApprove = vi.fn();
  const onReject = vi.fn();
  render(
    <InventoryAgentResultView
      result={result}
      state={state}
      openIngredients={
        overrides.open ?? new Set(findShortages(state, reference).map((s) => s.ingredientId))
      }
      decided={overrides.decided ?? {}}
      onApprove={onApprove}
      onReject={onReject}
    />,
  );
  return { state, result, onApprove, onReject };
};

describe("Inventory Agent panel", () => {
  it("shows draft orders with vendor, total and a verified badge, and says it ran without AI", async () => {
    const { result } = await setup();
    const cards = screen.getAllByTestId("draft-order");
    expect(cards).toHaveLength(result.drafts.length);
    const first = result.drafts[0]!;
    expect(cards[0]!.textContent).toContain(`${first.vendorName} · $${first.total.toFixed(2)}`);
    expect(within(cards[0]!).getByText("Vendor verified")).toBeTruthy();
    expect(screen.getByText("Rules only")).toBeTruthy();
    expect(screen.getByText(/No AI key is configured/)).toBeTruthy();
  });

  it("surfaces shortages handed to the Menu Agent, including the compliance reason", async () => {
    const sc = agentScenario();
    const { result } = await setup({ state: sc.state });
    expect(screen.getByText(/Handed to the Menu Agent/)).toBeTruthy();
    // The shortage whose only supplier has an unverified certificate is explained on screen.
    const handoff = result.messages.find(
      (m) => m.id === `inv-agent-handoff-${sc.unverified.ingredientId}`,
    );
    expect(handoff?.text).toContain("gluten-free facility certification not verified");
    expect(screen.getByText(handoff!.text)).toBeTruthy();
    // A shortage that is simply too slow is explained too.
    const slow = result.messages.find((m) => m.id === `inv-agent-handoff-${sc.slow.ingredientId}`);
    expect(screen.getByText(slow!.text)).toBeTruthy();
  });

  it("approving and rejecting call back with the exact draft", async () => {
    const { result, onApprove, onReject } = await setup();
    const first = result.drafts[0] as DraftPurchaseRequest;
    const card = screen.getAllByTestId("draft-order")[0]!;
    fireEvent.click(within(card).getByRole("button", { name: /approve order/i }));
    fireEvent.click(within(card).getByRole("button", { name: /reject/i }));
    expect(onApprove).toHaveBeenCalledWith(first);
    expect(onReject).toHaveBeenCalledWith(first);
  });

  it("replaces the buttons with the decision once decided", async () => {
    const probe = await runInventoryAgent(initialState(), { reference });
    cleanup();
    await setup({ decided: { [probe.drafts[0]!.id]: "approved" } });
    const card = screen.getAllByTestId("draft-order")[0]!;
    expect(within(card).getByText("approved")).toBeTruthy();
    expect(within(card).queryByRole("button", { name: /approve order/i })).toBeNull();
  });

  it("will not offer to approve a draft whose items are no longer short", async () => {
    await setup({ open: new Set() });
    for (const card of screen.getAllByTestId("draft-order")) {
      expect(within(card).getByText("No longer needed")).toBeTruthy();
      expect(within(card).queryByRole("button", { name: /approve order/i })).toBeNull();
    }
  });
});

describe("approving an agent draft uses the existing purchase flow", () => {
  it("records the order as incoming and removes those shortages from the next run", async () => {
    let state = initialState();
    const before = await runInventoryAgent(state, { reference });
    const draft = before.drafts[0] as DraftPurchaseRequest;
    state = reducer(
      state,
      {
        type: "approvePurchase",
        proposalId: draft.id,
        lines: draft.lines.map((l) => ({
          ingredientId: l.ingredientId,
          shortage: l.qty,
          qty: l.qty,
        })),
        modified: false,
        summary: `Approved ${draft.vendorName} order`,
        vendor: draft.vendorName,
        deliveryDate: draft.deliveryDate,
      },
      reference,
    );
    expect(state.orders?.[0]).toMatchObject({
      vendor: draft.vendorName,
      status: "incoming",
      deliveryDate: draft.deliveryDate,
    });
    const stillShort = new Set(findShortages(state, reference).map((s) => s.ingredientId));
    for (const line of draft.lines) expect(stillShort.has(line.ingredientId)).toBe(false);
    const after = await runInventoryAgent(state, { reference });
    expect(
      after.drafts.some(
        (d) =>
          d.vendorId === draft.vendorId &&
          d.lines.some((l) => draft.lines.some((x) => x.ingredientId === l.ingredientId)),
      ),
    ).toBe(false);
  });
});
