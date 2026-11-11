import { describe, expect, it } from "vitest";
import { initialState } from "@/lib/kitchen/data";
import type { KitchenState, PurchaseOrder } from "@/lib/kitchen/types";
import { VENDORS, vendorById } from "@/lib/kitchen/vendors";
import {
  allVendors,
  certificationState,
  findVendor,
  listVendors,
  orderTotal,
  receivedTotals,
  suppliedItems,
  vendorOrders,
  vendorStanding,
} from "@/lib/kitchen/vendor-views";

const reference = new Date("2026-11-10T12:00:00");
const vendor = (id: string) => {
  const found = vendorById(id);
  if (!found) throw new Error(`missing vendor ${id}`);
  return found;
};
const order = (
  id: string,
  vendorName: string,
  status: PurchaseOrder["status"],
  deliveryDate: string,
  lines: PurchaseOrder["lines"],
): PurchaseOrder => ({ id, vendor: vendorName, status, deliveryDate, lines });

describe("vendor standing", () => {
  it("is verified for a vendor with valid, verified paperwork", () => {
    const standing = vendorStanding(vendor("sysco"), reference);
    expect(standing.status).toBe("eligible");
    expect(standing.reasons).toEqual([]);
    expect(standing.license).toMatchObject({
      number: "FD-2291-CA",
      expires: "2027-06-30",
      state: "valid",
    });
    expect(standing.certifications.map((c) => c.label)).toEqual([
      "Food safety",
      "Gluten-free facility",
    ]);
  });

  it("blocks a vendor with an expired license and says when it expired", () => {
    const standing = vendorStanding(vendor("harbor-fresh"), reference);
    expect(standing.status).toBe("blocked");
    expect(standing.reasons).toContain("License expired 2026-09-30");
    expect(standing.license.state).toBe("expired");
    expect(standing.certifications.every((c) => c.state === "expired")).toBe(true);
  });

  it("marks a vendor with no license as unverified, not blocked", () => {
    const standing = vendorStanding(vendor("sunrise-coop"), reference);
    expect(standing.status).toBe("unverified");
    expect(standing.license.state).toBe("missing");
    expect(standing.reasons).toEqual([
      "No license on file",
      "Food safety certification not verified",
    ]);
  });

  it("marks a vendor with an unverified certificate document as unverified", () => {
    const standing = vendorStanding(vendor("hearth-bakery"), reference);
    expect(standing.status).toBe("unverified");
    expect(standing.reasons).toEqual(["Gluten-free facility certification not verified"]);
  });

  it("stays verified but warns when a document expires within 30 days", () => {
    const standing = vendorStanding(vendor("valley-farms"), reference);
    expect(standing.status).toBe("eligible");
    expect(standing.warnings).toEqual(["Food safety certification expires 2026-11-30"]);
    expect(standing.certifications[0]).toMatchObject({ state: "expiring", daysLeft: 20 });
  });

  it("classifies a single certificate: expired beats unverified, and counts days left", () => {
    const base = { kind: "food-safety" as const, issuer: "Test" };
    expect(
      certificationState({ ...base, expires: "2026-11-09", verified: false }, reference).state,
    ).toBe("expired");
    expect(
      certificationState({ ...base, expires: "2026-12-30", verified: false }, reference).state,
    ).toBe("unverified");
    expect(
      certificationState({ ...base, expires: "2026-12-30", verified: true }, reference),
    ).toEqual({ state: "valid", daysLeft: 50 });
  });
});

describe("what we get from a vendor", () => {
  it("lists the vendor's default ingredients and its explicit offers, with item-level compliance", () => {
    const state = initialState();
    const items = suppliedItems(vendor("harbor-fresh"), state, reference);
    expect(items.map((i) => i.ingredient.id).sort()).toEqual(["salmon", "shrimp"]);
    for (const item of items) {
      expect(item.source).toBe("alternate");
      expect(item.compliance.status).toBe("blocked");
    }
    expect(items.find((i) => i.ingredient.id === "shrimp")).toMatchObject({
      unitCost: 3.6,
      leadTimeDays: 1,
    });
  });

  it("uses the shared lead time and the ingredient's price for a default vendor", () => {
    const state: KitchenState = { ...initialState(), leadTimeDays: 3 };
    const chicken = suppliedItems(vendor("sysco"), state, reference).find(
      (i) => i.ingredient.id === "chicken",
    );
    expect(chicken).toMatchObject({
      source: "default",
      leadTimeDays: 3,
      unitCost: state.ingredients.find((i) => i.id === "chicken")?.unitCost,
    });
  });

  it("shows a backup supplier's own price and lead time", () => {
    const chicken = suppliedItems(vendor("farmstead-poultry"), initialState(), reference).find(
      (i) => i.ingredient.id === "chicken",
    );
    expect(chicken).toMatchObject({ source: "alternate", unitCost: 2.7, leadTimeDays: 4 });
    expect(chicken?.compliance.status).toBe("eligible");
  });

  it("flags only the items a certificate problem actually affects", () => {
    const items = suppliedItems(vendor("hearth-bakery"), initialState(), reference);
    expect(items.find((i) => i.ingredient.id === "gf-bread")?.compliance.status).toBe("unverified");
    expect(items.find((i) => i.ingredient.id === "bread")?.compliance.status).toBe("eligible");
  });
});

describe("orders and receipts", () => {
  const state = (): KitchenState => ({
    ...initialState(),
    orders: [
      order("o1", "Sysco", "incoming", "2026-11-12", [
        { ingredientId: "quinoa", shortage: 3, qty: 3 },
      ]),
      order("o2", "Sysco", "received", "2026-11-05", [
        { ingredientId: "chicken", shortage: 8, qty: 8 },
      ]),
      order("o3", "sysco ", "received", "2026-11-08", [
        { ingredientId: "chicken", shortage: 4, qty: 4 },
        { ingredientId: "tofu", shortage: 2, qty: 2 },
      ]),
      order("o4", "Valley Farms", "incoming", "2026-11-11", [
        { ingredientId: "milk", shortage: 2, qty: 2 },
      ]),
    ],
  });

  it("splits a vendor's orders into incoming and received, matching the name case-insensitively", () => {
    const orders = vendorOrders(vendor("sysco"), state());
    expect(orders.incoming.map((o) => o.id)).toEqual(["o1"]);
    expect(orders.received.map((o) => o.id)).toEqual(["o3", "o2"]);
  });

  it("totals what has been received per ingredient, with spend", () => {
    const s = state();
    const totals = receivedTotals(vendorOrders(vendor("sysco"), s).received, s);
    const chicken = s.ingredients.find((i) => i.id === "chicken");
    expect(totals.find((t) => t.ingredientId === "chicken")).toMatchObject({
      qty: 12,
      unit: chicken?.unit,
      spend: Math.round(12 * (chicken?.unitCost ?? 0) * 100) / 100,
    });
    expect(totals.map((t) => t.ingredientId).sort()).toEqual(["chicken", "tofu"]);
  });

  it("prices an order from ingredient unit costs", () => {
    const s = state();
    const quinoa = s.ingredients.find((i) => i.id === "quinoa");
    expect(orderTotal(s.orders![0]!, s)).toBe(Math.round(3 * (quinoa?.unitCost ?? 0) * 100) / 100);
  });

  it("counts incoming and received orders and the next delivery in the list", () => {
    const sysco = listVendors(state(), reference).find((v) => v.vendor.id === "sysco");
    expect(sysco).toMatchObject({
      incomingCount: 1,
      receivedCount: 2,
      nextDelivery: "2026-11-12",
      registered: true,
    });
  });
});

describe("vendor contact details", () => {
  it("gives every registry vendor a contact person, phone, email and address", () => {
    for (const v of VENDORS) {
      expect(v.contact?.name, `${v.id} contact name`).toBeTruthy();
      expect(v.contact?.role, `${v.id} contact role`).toBeTruthy();
      expect(v.address?.street, `${v.id} street`).toBeTruthy();
      expect(v.address?.city, `${v.id} city`).toBeTruthy();
      expect(v.address?.region, `${v.id} region`).toBeTruthy();
      expect(v.address?.postalCode, `${v.id} postal code`).toMatch(/^\d{5}$/);
    }
  });

  it("uses only fictional contact formats so nothing points at a real business", () => {
    for (const v of VENDORS) {
      // 555-01xx is the range reserved for fictional use; .example is a reserved domain.
      expect(v.contact?.phone, `${v.id} phone`).toMatch(/^\(\d{3}\) 555-01\d{2}$/);
      expect(v.contact?.email, `${v.id} email`).toMatch(/^[\w.]+@[\w-]+\.example$/);
    }
  });

  it("shows no contact details for a vendor that is not in the registry", () => {
    const base = initialState();
    const state: KitchenState = {
      ...base,
      ingredients: base.ingredients.map((i, idx) =>
        idx === 0 ? { ...i, vendor: "Acme Foods" } : i,
      ),
    };
    const acme = findVendor(state, "unregistered-acme-foods");
    expect(acme?.vendor.contact).toBeUndefined();
    expect(acme?.vendor.address).toBeUndefined();
  });
});

describe("vendor list", () => {
  it("includes every registry vendor and puts the ones needing attention first", () => {
    const list = listVendors(initialState(), reference);
    expect(list.filter((v) => v.registered)).toHaveLength(7);
    const order = list.map((v) => v.standing.status);
    expect(order).toEqual(
      [...order].sort(
        (a, b) =>
          ["blocked", "unverified", "eligible"].indexOf(a) -
          ["blocked", "unverified", "eligible"].indexOf(b),
      ),
    );
    expect(list[0]?.vendor.id).toBe("harbor-fresh");
  });

  it("surfaces a vendor that only appears on an ingredient, as unregistered with no license", () => {
    const base = initialState();
    const state: KitchenState = {
      ...base,
      ingredients: base.ingredients.map((i, idx) =>
        idx === 0 ? { ...i, vendor: "Acme Foods" } : i,
      ),
    };
    const acme = listVendors(state, reference).find((v) => v.vendor.name === "Acme Foods");
    expect(acme).toMatchObject({ registered: false });
    expect(acme?.standing.status).toBe("unverified");
    expect(acme?.itemCount).toBe(1);
    expect(findVendor(state, acme!.vendor.id)?.vendor.name).toBe("Acme Foods");
  });

  it("finds registry vendors by id and returns nothing for unknown ids", () => {
    expect(findVendor(initialState(), "sysco")?.vendor.name).toBe("Sysco");
    expect(findVendor(initialState(), "nope")).toBeUndefined();
    expect(allVendors(initialState()).length).toBeGreaterThanOrEqual(7);
  });
});
