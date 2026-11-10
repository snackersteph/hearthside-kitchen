import { dateKey } from "./schedule";
import type { Ingredient, KitchenState, PurchaseOrder } from "./types";
import {
  EXPIRY_WARNING_DAYS,
  vendorCompliance,
  type ComplianceResult,
  type ComplianceStatus,
} from "./vendor-engine";
import { VENDORS, type CertificationKind, type Vendor, type VendorCertification } from "./vendors";

/**
 * Read-only views over the vendor catalog and the app's order state, for the Vendors pages.
 * Pure functions: everything is derived, nothing is stored. Vendor data is fictional sample data.
 */

export const CERT_LABEL: Record<CertificationKind, string> = {
  "food-safety": "Food safety",
  "seafood-handling": "Seafood handling",
  "gluten-free-facility": "Gluten-free facility",
  halal: "Halal",
};

const round = (n: number) => Math.round(n * 100) / 100;
const daysBetween = (fromKey: string, toKey: string) =>
  Math.round(
    (new Date(`${toKey}T12:00:00`).getTime() - new Date(`${fromKey}T12:00:00`).getTime()) /
      86_400_000,
  );

export type DocumentState = "valid" | "expiring" | "expired" | "unverified" | "missing";

export interface CertificationView {
  kind: CertificationKind;
  label: string;
  issuer: string;
  expires: string;
  state: DocumentState;
  /** Negative when already expired. */
  daysLeft: number;
}

/** expired beats unverified; an expiring document is still valid. */
export function certificationState(
  cert: VendorCertification,
  reference = new Date(),
): { state: DocumentState; daysLeft: number } {
  const today = dateKey(reference);
  const daysLeft = daysBetween(today, cert.expires);
  if (cert.expires < today) return { state: "expired", daysLeft };
  if (!cert.verified) return { state: "unverified", daysLeft };
  return { state: daysLeft <= EXPIRY_WARNING_DAYS ? "expiring" : "valid", daysLeft };
}

export interface VendorStanding {
  /** Worst problem across the license and every certification on file. */
  status: ComplianceStatus;
  reasons: string[];
  warnings: string[];
  license: { number?: string; expires?: string; state: DocumentState; daysLeft?: number };
  certifications: CertificationView[];
}

/** The vendor-wide compliance picture (license plus every certification), independent of any one ingredient. */
export function vendorStanding(vendor: Vendor, reference = new Date()): VendorStanding {
  const today = dateKey(reference);
  const blocked: string[] = [];
  const unverified: string[] = [];
  const warnings: string[] = [];

  let license: VendorStanding["license"];
  if (!vendor.licenseNumber || !vendor.licenseExpires) {
    license = {
      ...(vendor.licenseNumber ? { number: vendor.licenseNumber } : {}),
      state: "missing",
    };
    unverified.push("No license on file");
  } else {
    const daysLeft = daysBetween(today, vendor.licenseExpires);
    const state: DocumentState =
      vendor.licenseExpires < today
        ? "expired"
        : daysLeft <= EXPIRY_WARNING_DAYS
          ? "expiring"
          : "valid";
    license = { number: vendor.licenseNumber, expires: vendor.licenseExpires, state, daysLeft };
    if (state === "expired") blocked.push(`License expired ${vendor.licenseExpires}`);
    if (state === "expiring") warnings.push(`License expires ${vendor.licenseExpires}`);
  }

  const certifications = vendor.certifications.map((cert): CertificationView => {
    const { state, daysLeft } = certificationState(cert, reference);
    const label = CERT_LABEL[cert.kind];
    if (state === "expired") blocked.push(`${label} certification expired ${cert.expires}`);
    if (state === "unverified") unverified.push(`${label} certification not verified`);
    if (state === "expiring") warnings.push(`${label} certification expires ${cert.expires}`);
    return { kind: cert.kind, label, issuer: cert.issuer, expires: cert.expires, state, daysLeft };
  });

  const status: ComplianceStatus = blocked.length
    ? "blocked"
    : unverified.length
      ? "unverified"
      : "eligible";
  return { status, reasons: [...blocked, ...unverified], warnings, license, certifications };
}

export interface SuppliedItem {
  ingredient: Ingredient;
  unitCost: number;
  leadTimeDays: number;
  /** "default" = the ingredient's usual vendor; "alternate" = a backup supplier. */
  source: "default" | "alternate";
  /** Compliance for this specific item (e.g. seafood needs a seafood-handling certificate). */
  compliance: ComplianceResult;
}

/** Everything we can get from this vendor, with the price and lead time the Inventory Agent would use. */
export function suppliedItems(
  vendor: Vendor,
  state: KitchenState,
  reference = new Date(),
): SuppliedItem[] {
  const defaultLead = Math.max(1, state.leadTimeDays ?? 2);
  const items: SuppliedItem[] = [];
  for (const ingredient of state.ingredients) {
    const explicit = vendor.offers[ingredient.id];
    const isDefault = ingredient.vendor === vendor.name;
    if (!explicit && !isDefault) continue;
    items.push({
      ingredient,
      unitCost: explicit?.unitCost ?? ingredient.unitCost,
      leadTimeDays: explicit?.leadTimeDays ?? defaultLead,
      source: isDefault ? "default" : "alternate",
      compliance: vendorCompliance(vendor, ingredient.id, reference),
    });
  }
  return items.sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name));
}

const sameVendor = (order: PurchaseOrder, vendor: Vendor) =>
  order.vendor.trim().toLowerCase() === vendor.name.trim().toLowerCase();

export function vendorOrders(
  vendor: Vendor,
  state: KitchenState,
): { incoming: PurchaseOrder[]; received: PurchaseOrder[] } {
  const mine = (state.orders ?? []).filter((order) => sameVendor(order, vendor));
  return {
    incoming: mine
      .filter((o) => o.status === "incoming")
      .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate)),
    received: mine
      .filter((o) => o.status === "received")
      .sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate)),
  };
}

export function orderTotal(order: PurchaseOrder, state: KitchenState): number {
  return round(
    order.lines.reduce(
      (sum, line) =>
        sum + line.qty * (state.ingredients.find((i) => i.id === line.ingredientId)?.unitCost ?? 0),
      0,
    ),
  );
}

export interface ReceivedTotal {
  ingredientId: string;
  name: string;
  unit: string;
  qty: number;
  spend: number;
}

/** What we have actually received from this vendor so far, summed per ingredient. */
export function receivedTotals(orders: PurchaseOrder[], state: KitchenState): ReceivedTotal[] {
  const byIngredient = new Map<string, ReceivedTotal>();
  for (const order of orders) {
    for (const line of order.lines) {
      const ingredient = state.ingredients.find((i) => i.id === line.ingredientId);
      const total = byIngredient.get(line.ingredientId) ?? {
        ingredientId: line.ingredientId,
        name: ingredient?.name ?? line.ingredientId,
        unit: ingredient?.unit ?? "",
        qty: 0,
        spend: 0,
      };
      total.qty = round(total.qty + line.qty);
      total.spend = round(total.spend + line.qty * (ingredient?.unitCost ?? 0));
      byIngredient.set(line.ingredientId, total);
    }
  }
  return [...byIngredient.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/* ---------------------------- listing ---------------------------- */

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** A vendor named on an ingredient or order that is not in the vendor registry: no license on file. */
function unregisteredVendor(name: string): Vendor {
  return {
    id: `unregistered-${slug(name)}`,
    name,
    certifications: [],
    offers: {},
    notes: "Not in the vendor registry. No license or certifications on file.",
  };
}

/** Registry vendors plus any vendor names that only appear on ingredients or orders. */
export function allVendors(state: KitchenState): { vendor: Vendor; registered: boolean }[] {
  const known = new Set(VENDORS.map((v) => v.name.toLowerCase()));
  const extra = new Map<string, string>();
  for (const name of [
    ...state.ingredients.map((i) => i.vendor),
    ...(state.orders ?? []).map((o) => o.vendor),
  ]) {
    const trimmed = name.trim();
    if (trimmed && !known.has(trimmed.toLowerCase()) && !extra.has(trimmed.toLowerCase()))
      extra.set(trimmed.toLowerCase(), trimmed);
  }
  return [
    ...VENDORS.map((vendor) => ({ vendor, registered: true })),
    ...[...extra.values()].map((name) => ({ vendor: unregisteredVendor(name), registered: false })),
  ];
}

export function findVendor(
  state: KitchenState,
  id: string,
): { vendor: Vendor; registered: boolean } | undefined {
  return allVendors(state).find((entry) => entry.vendor.id === id);
}

export interface VendorSummary {
  vendor: Vendor;
  registered: boolean;
  standing: VendorStanding;
  itemCount: number;
  incomingCount: number;
  receivedCount: number;
  nextDelivery?: string;
}

const SEVERITY: Record<ComplianceStatus, number> = { blocked: 0, unverified: 1, eligible: 2 };

/** Vendors that need attention first (blocked, then unverified), then by name. */
export function listVendors(state: KitchenState, reference = new Date()): VendorSummary[] {
  return allVendors(state)
    .map(({ vendor, registered }): VendorSummary => {
      const orders = vendorOrders(vendor, state);
      const nextDelivery = orders.incoming[0]?.deliveryDate;
      return {
        vendor,
        registered,
        standing: vendorStanding(vendor, reference),
        itemCount: suppliedItems(vendor, state, reference).length,
        incomingCount: orders.incoming.length,
        receivedCount: orders.received.length,
        ...(nextDelivery ? { nextDelivery } : {}),
      };
    })
    .sort(
      (a, b) =>
        SEVERITY[a.standing.status] - SEVERITY[b.standing.status] ||
        a.vendor.name.localeCompare(b.vendor.name),
    );
}
