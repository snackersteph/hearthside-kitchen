import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanCard, RoomMessage, TypingIndicator } from "@/components/kitchen/agent-room-view";
import type { RoomEvent, RoomPlan } from "@/lib/kitchen/agent-room";
import type { RoomRole } from "@/lib/kitchen/agent-room-access";

afterEach(cleanup);

const event = (over: Partial<RoomEvent>): RoomEvent => ({
  id: "e1",
  from: "menu",
  to: "dietary",
  kind: "proposal",
  tone: "info",
  text: "Hello there",
  ...over,
});
const plan = (over: Partial<RoomPlan> = {}): RoomPlan => ({
  date: "2026-11-13",
  meal: "dinner",
  dishId: "d1",
  dishName: "Puréed Salmon & Carrot",
  overrides: {},
  alternatives: [
    { dishId: "d2", dishName: "Tofu Stew", residentNames: ["Linda Martinez", "Susan Miller"] },
  ],
  unresolved: [],
  blocked: [],
  orders: [
    {
      id: "o1",
      vendorId: "pacific-seafood",
      vendorName: "Pacific Seafood",
      lines: [],
      total: 261,
      deliveryDate: "2026-11-13",
      status: "draft",
      warnings: [],
    },
  ],
  orderTotal: 261,
  approver: "management",
  ready: true,
  ...over,
});

const renderCard = (
  role: RoomRole,
  over: Partial<RoomPlan> = {},
  status: "open" | "escalated" | "approved" = "open",
) => {
  const handlers = { onApprove: vi.fn(), onSendToManagement: vi.fn(), onAnother: vi.fn() };
  render(<PlanCard plan={plan(over)} role={role} status={status} {...handlers} />);
  return handlers;
};
const button = (name: RegExp) => screen.queryByRole("button", { name }) as HTMLButtonElement | null;

describe("Agent Room messages", () => {
  it("shows who is talking to whom, and what they say", () => {
    render(
      <RoomMessage
        event={event({ from: "inventory", to: "menu", text: "I can't get chicken by Thu." })}
      />,
    );
    const message = screen.getByTestId("room-message");
    expect(within(message).getByText("Inventory Agent")).toBeTruthy();
    expect(within(message).getByText(/to Menu Agent/)).toBeTruthy();
    expect(within(message).getByText("I can't get chicken by Thu.")).toBeTruthy();
  });

  it("flags a handoff and an approval request", () => {
    render(<RoomMessage event={event({ kind: "handoff", tone: "alert" })} />);
    expect(screen.getByText("Handoff")).toBeTruthy();
    cleanup();
    render(<RoomMessage event={event({ from: "menu", to: "chef", kind: "approval-request" })} />);
    expect(screen.getByText("Needs approval")).toBeTruthy();
  });

  it("tells people apart from agents", () => {
    render(<RoomMessage event={event({ from: "chef", to: "menu" })} />);
    expect(screen.getByTestId("room-message").getAttribute("data-from")).toBe("chef");
    expect(screen.getByText("Chef")).toBeTruthy();
  });

  it("names whoever is about to speak", () => {
    render(<TypingIndicator actor="dietary" />);
    expect(screen.getByText(/Dietary Agent is working/)).toBeTruthy();
  });
});

describe("Agent Room plan card: what each role can press", () => {
  it("shows the plan: dish, alternatives with first names, orders and total", () => {
    renderCard("chef");
    const card = screen.getByTestId("plan-card");
    expect(within(card).getByText("Puréed Salmon & Carrot")).toBeTruthy();
    expect(card.textContent).toContain("Tofu Stew");
    expect(card.textContent).toContain("Linda, Susan");
    expect(card.textContent).toContain("Pacific Seafood");
    expect(card.textContent).toContain("Total $261.00");
    expect(screen.getByText("Needs Management")).toBeTruthy();
  });

  it("gives the Chef 'Send to Management', not 'Approve', for an order over the limit", () => {
    const h = renderCard("chef");
    expect(button(/^approve/i)).toBeNull();
    fireEvent.click(button(/send to management/i)!);
    expect(h.onSendToManagement).toHaveBeenCalledTimes(1);
    expect(h.onApprove).not.toHaveBeenCalled();
  });

  it("lets the Chef approve an order within the limit", () => {
    const h = renderCard("chef", { approver: "chef", orderTotal: 40 });
    fireEvent.click(button(/^approve/i)!);
    expect(h.onApprove).toHaveBeenCalledTimes(1);
    expect(button(/send to management/i)).toBeNull();
  });

  it("lets Management approve the big order", () => {
    const h = renderCard("management");
    const approve = button(/approve as management/i)!;
    expect(approve.disabled).toBe(false);
    fireEvent.click(approve);
    expect(h.onApprove).toHaveBeenCalledTimes(1);
  });

  it("keeps Caregivers read-only and explains why", () => {
    renderCard("caregiver", { approver: "chef", orderTotal: 40 });
    expect(button(/^approve/i)!.disabled).toBe(true);
    expect(button(/another option/i)!.disabled).toBe(true);
    expect(screen.getByText("Caregivers can't approve plans.")).toBeTruthy();
  });

  it("will not let anyone approve a plan with open problems", () => {
    renderCard("management", {
      ready: false,
      unresolved: ["Linda Martinez"],
      blocked: [
        {
          ingredientId: "chicken",
          name: "Chicken breast",
          reason: "the earliest delivery is Fri, Nov 13",
        },
      ],
    });
    expect(button(/approve as management/i)!.disabled).toBe(true);
    expect(screen.getByText("Needs a decision")).toBeTruthy();
    expect(screen.getByText(/No safe option on file for Linda/)).toBeTruthy();
    expect(screen.getByText(/Chicken breast can't arrive in time/)).toBeTruthy();
  });

  it("shows 'Sent to Management' to the Chef once it is on its way", () => {
    renderCard("chef", {}, "escalated");
    expect(button(/sent to management/i)!.disabled).toBe(true);
    expect(screen.getByText("Waiting for Management")).toBeTruthy();
  });

  it("drops the buttons once approved", () => {
    renderCard("management", {}, "approved");
    expect(screen.getByText("Approved and saved")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("offers another option to anyone who may ask for one", () => {
    const h = renderCard("chef");
    fireEvent.click(button(/another option/i)!);
    expect(h.onAnother).toHaveBeenCalledTimes(1);
  });
});
