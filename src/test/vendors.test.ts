import { describe, it, expect } from "vitest";
import { initialState } from "@/lib/kitchen/data";
import { reducer } from "@/lib/kitchen/store";
import { vendorDirectory, vendorMatches, vendorPurchases, validVendor } from "@/lib/kitchen/vendors";
import type { Vendor } from "@/lib/kitchen/types";

const vendor: Vendor = { id: "test-vendor", name: "Test vendor", aliases: [], contactName: "Lee", email: "lee@example.org", phone: "123", website: "https://example.org/", address: "1 Market Street", notes: "Call before delivery" };
describe("shared vendor records", () => {
  it("adds and edits contact information through shared actions", () => {
    const added = reducer(initialState(), { type: "saveVendor", vendor });
    expect(vendorDirectory(added).find((v) => v.id === vendor.id)?.email).toBe("lee@example.org");
    const edited = reducer(added, { type: "saveVendor", vendor: { ...vendor, phone: "456" } });
    expect(vendorDirectory(edited).find((v) => v.id === vendor.id)?.phone).toBe("456");
  });
  it("keeps orders connected when a vendor is renamed", () => {
    const state = { ...initialState(), vendors: [vendor], orders: [{ id: "test-order", vendor: "Test vendor", lines: [], deliveryDate: "2026-11-22", status: "incoming" as const }] };
    const edited = reducer(state, { type: "saveVendor", vendor: { ...vendor, name: "New name" } });
    const saved = vendorDirectory(edited).find((v) => v.id === vendor.id);
    if (!saved) throw new Error("Vendor missing");
    expect(vendorMatches(saved, "Test vendor")).toBe(true);
    expect(vendorPurchases(edited, new Date("2026-11-21T12:00:00Z")).filter((o) => vendorMatches(saved, o.proposal.vendor)).map((o) => o.id)).toContain("test-order");
    expect(edited.orders).toEqual(state.orders);
  });
  it("deletes contact information without deleting orders or stock", () => {
    const state = { ...initialState(), vendors: [vendor], orders: [{ id: "test-order", vendor: vendor.name, lines: [], deliveryDate: "2026-11-22", status: "incoming" as const }] };
    const deleted = reducer(state, { type: "deleteVendor", id: vendor.id });
    expect(vendorDirectory(deleted).some((v) => v.id === vendor.id)).toBe(false);
    expect(vendorDirectory(deleted, true).find((v) => v.id === vendor.id)?.email).toBe("");
    expect(deleted.orders).toEqual(state.orders);
    expect(deleted.ingredients).toEqual(state.ingredients);
  });
  it("rejects duplicate names and unsafe website links", () => {
    const state = { ...initialState(), vendors: [vendor] };
    expect(reducer(state, { type: "saveVendor", vendor: { ...vendor, id: "duplicate", name: " test VENDOR " } })).toBe(state);
    expect(validVendor({ ...vendor, website: "javascript:alert(1)" })).toBe(false);
  });
});