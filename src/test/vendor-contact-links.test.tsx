import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KitchenProvider } from "@/lib/kitchen/store";
import { initialState } from "@/lib/kitchen/data";
import { InventoryOrders } from "@/components/kitchen/inventory-orders";
import { PurchaseDetailsDialog } from "@/routes/approvals";
import type { KitchenState, PurchaseProposal } from "@/lib/kitchen/types";

// Links are asserted as plain anchors carrying the route, its params and its search.
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ children, to, params, search, className }: { children: ReactNode; to: string; params?: unknown; search?: unknown; className?: string }) => (
    <a className={className} href={to} data-to={to} data-params={JSON.stringify(params ?? null)} data-search={JSON.stringify(search ?? null)}>{children}</a>
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
    get length() { return data.size; },
  };
};

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(new Date(2026, 10, 17, 9, 0));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const settle = async (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const mount = async (ui: ReactNode, state?: KitchenState) => {
  if (state) localStorage.setItem("mock-db:kitchen_snapshot", JSON.stringify([{ id: 1, state, through_action_id: 0 }]));
  const view = render(<KitchenProvider>{ui}</KitchenProvider>);
  await settle();
  return view;
};
const attrs = (el: Element) => ({ to: el.getAttribute("data-to"), params: JSON.parse(el.getAttribute("data-params") ?? "null"), search: JSON.parse(el.getAttribute("data-search") ?? "null") });

describe("contact vendor links", () => {
  it("opens the vendor page for the order shown in an incoming inventory order", async () => {
    await mount(<InventoryOrders mode="incoming" />);
    fireEvent.click(screen.getAllByRole("button", { name: "View" })[0]!);
    const dialog = screen.getByRole("dialog");
    const contact = within(dialog).getByRole("link", { name: /contact vendor/i });
    const vendorName = within(dialog).getByRole("link", { name: /^(sysco|pacific seafood|valley farms|green garden|ocean basket|dairy center|northfield bakery)$/i });
    expect(attrs(contact).to).toBe("/vendors/$vendorId");
    expect(attrs(contact).params).toEqual(attrs(vendorName).params);
    expect(attrs(contact).search).toMatchObject({ source: "inventory", view: "incoming" });
    expect(typeof attrs(contact).search.order).toBe("string");
    expect(attrs(contact).search.order.length).toBeGreaterThan(0);
    expect(contact.getAttribute("href")).toBe("/vendors/$vendorId");
    expect(contact.getAttribute("target")).toBeNull();
  });

  it("opens the vendor page for the order shown in a delivered inventory order", async () => {
    await mount(<InventoryOrders mode="delivered" />);
    const view = screen.getAllByRole("button", { name: "View" })[0]!;
    fireEvent.click(view);
    const dialog = screen.getByRole("dialog");
    const contact = within(dialog).getByRole("link", { name: /contact vendor/i });
    expect(attrs(contact).to).toBe("/vendors/$vendorId");
    expect(attrs(contact).search).toMatchObject({ source: "inventory", view: "delivered" });
    expect(typeof attrs(contact).search.order).toBe("string");
  });

  it("opens the vendor page for a purchase request in the Approval Center", async () => {
    const proposal: PurchaseProposal = { id: "detail-order", kind: "purchase", agent: "inventory", vendor: "Sysco", deliveryDate: "2026-11-23", lines: [{ ingredientId: "chicken", qty: 8, shortage: 6 }], total: 80 };
    await mount(<PurchaseDetailsDialog p={proposal} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    const contact = within(dialog).getByRole("link", { name: /contact vendor/i });
    expect(attrs(contact).to).toBe("/vendors/$vendorId");
    expect(attrs(contact).params).toEqual({ vendorId: "vendor-sysco" });
    expect(attrs(contact).search).toEqual({ order: "detail-order", source: "approvals" });
  });

  it("keeps an external website link when the vendor has no directory record", async () => {
    const proposal: PurchaseProposal = { id: "unknown-order", kind: "purchase", agent: "inventory", vendor: "Zephyr Provisions", deliveryDate: "2026-11-23", lines: [{ ingredientId: "chicken", qty: 8, shortage: 6 }], total: 80 };
    const state = initialState();
    state.orders = [];
    state.vendors = [];
    state.ingredients = state.ingredients.map((i) => ({ ...i, vendor: "Northfield Bakery" }));
    await mount(<PurchaseDetailsDialog p={proposal} onClose={() => {}} />, state);
    const contact = within(screen.getByRole("dialog")).getByRole("link", { name: /contact vendor/i });
    expect(contact.getAttribute("data-to")).toBeNull();
    expect(contact.getAttribute("target")).toBe("_blank");
    expect(contact.getAttribute("href")).toContain("Zephyr");
  });
});
