import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentWorkspace } from "@/components/kitchen/agent-workspace";
import { KitchenProvider } from "@/lib/kitchen/store";
import { dishById } from "@/lib/kitchen/data";
import { resolveMenuState } from "@/lib/kitchen/engine";
import { MEALS, type KitchenState } from "@/lib/kitchen/types";

// Links need a router; the workspace only renders them, so plain anchors are enough here.
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ children, className, to, search, "aria-label": label }: { children: ReactNode; className?: string; to?: string; search?: unknown; "aria-label"?: string }) => (
    <a className={className} aria-label={label} data-to={to} data-search={search === undefined ? undefined : JSON.stringify(search)}>{children}</a>
  ),
}));

const mount = async () => {
  const view = render(<KitchenProvider><AgentWorkspace /></KitchenProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  return view;
};
const runAllSteps = async () => {
  for (let i = 0; i < 8; i++) await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
};

// Node's built-in localStorage can shadow jsdom's; use a plain in-memory store per test.
const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() { return data.size; },
  };
};

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(new Date(2026, 10, 11, 9, 30));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const generate = async () => {
  fireEvent.click(screen.getByRole("button", { name: /Generate Weekly Plan/ }));
  await runAllSteps();
};
const section = (name: string) => screen.getByRole("region", { name });
const savedState = () => JSON.parse(localStorage.getItem("kitchen-command-v1")!) as KitchenState;

describe("Agent Workspace", () => {
  it("runs the selected week's workflow, pauses for review, and survives a refresh", async () => {
    const view = await mount();
    expect(within(section("Service week")).getByText("November 23–29, 2026")).toBeTruthy();
    expect(screen.getByText(/No collaboration yet for this week/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Generate Weekly Plan/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    // A second click cannot start an overlapping run.
    expect((screen.getByRole("button", { name: /Generating… step 1 of 6/ }) as HTMLButtonElement).disabled).toBe(true);

    await runAllSteps();
    expect(screen.getByLabelText("Menu approval status: Needs Review")).toBeTruthy();
    expect(screen.getByText(/Stage 1 — Dietary Requirements Shared/)).toBeTruthy();
    expect(screen.getByText(/Stage 5 — Manager Review/)).toBeTruthy();
    expect(within(section("Weekly meal coverage")).getByText(/21 of 21 meals planned · \d+ of 20 residents/)).toBeTruthy();

    // Refresh: unmount and remount from storage.
    view.unmount();
    await mount();
    expect(screen.getByText(/Stage 5 — Manager Review/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Approve Weekly Menu/ })).toBeTruthy();
  });

  it("shows the three-stage lifecycle with target dates and overdue actions", async () => {
    await mount();
    const lifecycle = section("Weekly lifecycle");
    expect(within(lifecycle).getByLabelText("Plan Menu: In progress")).toBeTruthy();
    expect(within(lifecycle).getByText("Approve menu by Sun, Nov 15")).toBeTruthy();
    expect(within(lifecycle).getByLabelText("Purchase Ingredients: Upcoming")).toBeTruthy();
    expect(within(lifecycle).getByLabelText("Prepare & Serve: Upcoming")).toBeTruthy();

    // The current service week (Nov 9–15) never had its menu approved.
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    const current = section("Weekly lifecycle");
    expect(within(current).getByLabelText("Plan Menu: Overdue")).toBeTruthy();
    expect(within(current).getByText(/Menu approval overdue since Sun, Nov 1/)).toBeTruthy();
    expect(within(current).getByLabelText("Prepare & Serve: In progress")).toBeTruthy();
  });

  it("changes every section when a different week is selected", async () => {
    await mount();
    await generate();
    expect(screen.getByText(/Stage 1 — Dietary Requirements Shared/)).toBeTruthy();
    expect(screen.getByRole("region", { name: "Manager decisions" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(within(section("Service week")).getByText("November 30–December 6, 2026")).toBeTruthy();
    expect(within(section("Weekly lifecycle")).getByText("Approve menu by Sun, Nov 22")).toBeTruthy();
    expect(screen.getByText(/No collaboration yet for this week/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Manager decisions" })).toBeNull();
    expect(screen.getAllByText("No actions yet for this week.")).toHaveLength(3);
    expect(within(section("Weekly meal coverage")).getByText(/0 of 21 meals planned/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(screen.getByText(/Stage 1 — Dietary Requirements Shared/)).toBeTruthy();
  });

  it("shows a meal matrix that matches the Daily Menu schedule", async () => {
    await mount();
    await generate();
    const state = savedState();
    const coverage = section("Weekly meal coverage");
    for (let d = 0; d < 7; d++) {
      const day = resolveMenuState(state, 12 + d, new Date(2026, 10, 11, 9, 30));
      for (const meal of MEALS) {
        const dish = dishById(day.plan[meal]).name;
        const label = `${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d]} ${meal[0]!.toUpperCase()}${meal.slice(1)}: ${dish}`;
        expect(within(coverage).getByRole("button", { name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(`) })).toBeTruthy();
      }
    }
    // Opening a cell shows the actual recipe and its validation.
    const first = within(coverage).getAllByRole("button")[0]!;
    fireEvent.click(first);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Dietary check")).toBeTruthy();
    expect(within(dialog).getByText("Inventory check")).toBeTruthy();
    expect(within(dialog).getByText("Ingredients")).toBeTruthy();
  });

  it("keeps manager decisions prominent and blocks approval while reviews are open", async () => {
    await mount();
    await generate();
    const decisions = section("Manager decisions");
    const overview = section("AI team overview");
    // Decisions render before the agent overview and the detail sections.
    expect(decisions.compareDocumentPosition(overview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const approve = within(decisions).getByRole("button", { name: /Approve Weekly Menu/ }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    const alternativesBlocker = within(within(decisions).getByRole("list", { name: "Approval blockers" })).getByText(/awaiting approval in the Approval Center/).closest("li")!;
    // Review opens the Approval Center filtered to the week being worked on (two weeks out by default).
    const review = within(alternativesBlocker).getByText("Review");
    expect(review.getAttribute("data-to")).toBe("/approvals");
    // fromDashboard carries the dashboard week so the Approval Center can offer a way back.
    expect(JSON.parse(review.getAttribute("data-search")!)).toEqual({ week: "two", fromDashboard: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(within(decisions).getByText(/Purchasing doesn't block menu approval/)).toBeTruthy();
    fireEvent.click(approve);
    expect(screen.queryByText("Weekly Menu Approved")).toBeNull();
  });
});
