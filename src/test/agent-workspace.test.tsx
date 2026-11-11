import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentWorkspace } from "@/components/kitchen/agent-workspace";
import { KitchenProvider } from "@/lib/kitchen/store";

// Links need a router; the workspace only renders them, so plain anchors are enough here.
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ children, className, "aria-label": label }: { children: ReactNode; className?: string; "aria-label"?: string }) => (
    <a className={className} aria-label={label}>{children}</a>
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

describe("Agent Workspace", () => {
  it("runs the selected week's workflow, pauses for review, and survives a refresh", async () => {
    const view = await mount();
    expect(screen.getByText("November 23–29, 2026")).toBeTruthy();
    expect(screen.getByText(/No collaboration yet for this week/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Generate Weekly Plan/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByRole("button", { name: /Generating… step 1 of 6/ })).toBeTruthy();
    // A second click cannot start an overlapping run.
    expect((screen.getByRole("button", { name: /Generating…/ }) as HTMLButtonElement).disabled).toBe(true);

    await runAllSteps();
    expect(screen.getAllByText("Needs Review").length).toBeGreaterThan(0);
    expect(screen.getByText(/Stage 1 — Analyze Weekly Requirements/)).toBeTruthy();
    expect(screen.getByText(/Stage 5 — Human Review and Approval/)).toBeTruthy();
    expect(screen.getAllByText(/Constraints for \d+ residents with restrictions/).length).toBeGreaterThan(0);
    const summary = screen.getByRole("region", { name: "Weekly summary" });
    expect(within(summary).getByText("21 / 21")).toBeTruthy();
    expect(within(summary).getByText(/ \/ 20$/)).toBeTruthy();

    // Refresh: unmount and remount from localStorage.
    view.unmount();
    await mount();
    expect(screen.getByText(/Stage 5 — Human Review and Approval/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Approve Weekly Menu/ })).toBeTruthy();
  });

  it("shows different activity for a different week", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /Generate Weekly Plan/ }));
    await runAllSteps();
    expect(screen.getByText(/Stage 1 — Analyze Weekly Requirements/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(screen.getByText(/November 30–December 6, 2026/)).toBeTruthy();
    expect(screen.getByText(/No collaboration yet for this week/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(screen.getByText(/Stage 1 — Analyze Weekly Requirements/)).toBeTruthy();
  });

  it("blocks weekly approval while required reviews are open, and says what they are", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /Generate Weekly Plan/ }));
    await runAllSteps();
    const approve = screen.getByRole("button", { name: /Approve Weekly Menu/ }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    const blockers = screen.getByRole("list", { name: "Approval blockers" });
    expect(within(blockers).getByText(/resident alternatives? awaiting approval in the Approval Center/)).toBeTruthy();
    // Purchasing never blocks menu approval; it is listed as a separate task.
    expect(screen.queryByText(/remain purchasing tasks|purchasing tasks; they don't block/)).toBeTruthy();
    fireEvent.click(approve);
    expect(screen.queryByText("Weekly Menu Approved")).toBeNull();
  });
});
