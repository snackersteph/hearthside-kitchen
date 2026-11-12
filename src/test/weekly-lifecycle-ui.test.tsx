import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentWorkspace } from "@/components/kitchen/agent-workspace";
import { KitchenProvider } from "@/lib/kitchen/store";
import type { KitchenState } from "@/lib/kitchen/types";

// Links need a router; the workspace only renders them, so plain anchors are enough here.
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a className={className}>{children}</a>
  ),
}));

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
};

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
  // Tuesday Nov 17, 2026: the Nov 30 – Dec 6 service week is in its planning phase.
  vi.setSystemTime(new Date(2026, 10, 17, 9, 0));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const settle = async (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const mount = async (ui: ReactNode = <AgentWorkspace />) => {
  const view = render(<KitchenProvider>{ui}</KitchenProvider>);
  await settle();
  return view;
};
const weekLabel = () => within(screen.getByRole("region", { name: "Service week" }));

describe("weekly lifecycle in the Agent Workspace", () => {
  it("opens on the week now in planning (Nov 30) and switches between service weeks", async () => {
    await mount();
    expect(weekLabel().getByText("November 30–December 6, 2026")).toBeTruthy();
    expect(weekLabel().getByText("Planning week")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(weekLabel().getByText("December 7–13, 2026")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(weekLabel().getByText("November 23–29, 2026")).toBeTruthy();
    expect(weekLabel().getByText("Purchasing week")).toBeTruthy();
  });

  it("opens a linked week (from the calendar or Kitchen Pulse) and reports week changes", async () => {
    const onWeekChange = vi.fn();
    await mount(<AgentWorkspace week="2026-12-02" onWeekChange={onWeekChange} />);
    expect(weekLabel().getByText("November 30–December 6, 2026")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(onWeekChange).toHaveBeenCalledWith("2026-12-07");
  });

  it("keeps a generated week's review when switching away and back, and after a refresh", async () => {
    const view = await mount();
    fireEvent.click(screen.getByRole("button", { name: /Generate Weekly Plan/ }));
    for (let i = 0; i < 8; i++) await settle(1000);
    expect(screen.getByText(/Stage 5 — Manager Review/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(screen.getByText(/No collaboration yet for this week/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(screen.getByText(/Stage 5 — Manager Review/)).toBeTruthy();
    // Only the selected week was created; neighbouring weeks are untouched.
    const saved = JSON.parse(localStorage.getItem("kitchen-command-v1")!) as KitchenState;
    expect(saved.weeklyPlans?.map((p) => p.id)).toEqual(["week-2026-11-30"]);
    view.unmount();
    await mount();
    expect(weekLabel().getByText("November 30–December 6, 2026")).toBeTruthy();
    expect(screen.getByText(/Stage 5 — Manager Review/)).toBeTruthy();
  });

  it("loads the shared kitchen after a refresh instead of reseeding the demo", async () => {
    const view = await mount();
    const [snap] = JSON.parse(localStorage.getItem("mock-db:kitchen_snapshot")!) as { state: KitchenState }[];
    localStorage.setItem("mock-db:kitchen_snapshot", JSON.stringify([{ ...snap, state: { ...snap!.state, leadTimeDays: 9 } }]));
    view.unmount();
    await mount();
    expect(
      (JSON.parse(localStorage.getItem("kitchen-command-v1")!) as KitchenState).leadTimeDays,
    ).toBe(9);
  });
});
