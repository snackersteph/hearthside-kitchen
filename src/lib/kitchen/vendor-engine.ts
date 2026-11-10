import { dateKey, dayAt } from "./schedule";
import type { Ingredient } from "./types";
import { VENDORS, type CertificationKind, type Vendor } from "./vendors";

/**
 * Inventory Agent: vendor compliance + sourcing. Pure and deterministic, like
 * analyze(). The AI layer may explain these results but never changes them.
 * All license/certification data is simulated sample data.
 */

/** Warn when a license/certificate expires within this many days. */
export const EXPIRY_WARNING_DAYS = 30;

export type ComplianceStatus = "eligible" | "blocked" | "unverified";

export interface ComplianceResult {
  status: ComplianceStatus;
  /** Why the vendor is blocked or unverified (empty when eligible). */
  reasons: string[];
  /** Eligible, but staff should know (e.g. certificate expires soon). */
  warnings: string[];
}

/** Certifications an ingredient requires from any vendor supplying it. */
export function requiredCertifications(ingredientId: string): CertificationKind[] {
  const required: CertificationKind[] = ["food-safety"];
  if (["salmon", "shrimp"].includes(ingredientId)) required.push("seafood-handling");
  if (["gf-bread", "gf-pasta", "oats"].includes(ingredientId))
    required.push("gluten-free-facility");
  return required;
}

const KIND_LABEL: Record<CertificationKind, string> = {
  "food-safety": "food-safety",
  "seafood-handling": "seafood-handling",
  "gluten-free-facility": "gluten-free facility",
  halal: "halal",
};

const daysBetween = (fromKey: string, toKey: string) =>
  Math.round(
    (new Date(`${toKey}T12:00:00`).getTime() - new Date(`${fromKey}T12:00:00`).getTime()) /
      86_400_000,
  );

/**
 * Deterministic compliance check for one vendor supplying one ingredient.
 * blocked    = a documented problem (expired license/cert, required cert missing)
 * unverified = the facts cannot be confirmed (no license, unverified document)
 * Blocked takes precedence over unverified.
 */
export function vendorCompliance(
  vendor: Vendor,
  ingredientId: string,
  reference = new Date(),
  extraRequired: CertificationKind[] = [],
): ComplianceResult {
  const today = dateKey(reference);
  const blocked: string[] = [];
  const unverified: string[] = [];
  const warnings: string[] = [];

  if (!vendor.licenseNumber || !vendor.licenseExpires) unverified.push("no license on file");
  else if (vendor.licenseExpires < today) blocked.push(`license expired ${vendor.licenseExpires}`);
  else if (daysBetween(today, vendor.licenseExpires) <= EXPIRY_WARNING_DAYS)
    warnings.push(`license expires ${vendor.licenseExpires}`);

  for (const kind of new Set([...requiredCertifications(ingredientId), ...extraRequired])) {
    const label = KIND_LABEL[kind];
    const found = vendor.certifications.find((c) => c.kind === kind);
    if (!found) blocked.push(`missing ${label} certification`);
    else if (found.expires < today) blocked.push(`${label} certification expired ${found.expires}`);
    else if (!found.verified) unverified.push(`${label} certification not verified`);
    else if (daysBetween(today, found.expires) <= EXPIRY_WARNING_DAYS)
      warnings.push(`${label} certification expires ${found.expires}`);
  }

  if (blocked.length) return { status: "blocked", reasons: [...blocked, ...unverified], warnings };
  if (unverified.length) return { status: "unverified", reasons: unverified, warnings };
  return { status: "eligible", reasons: [], warnings };
}

export interface VendorOption {
  vendorId: string;
  vendorName: string;
  unitCost: number;
  /** Cost of the pack-rounded quantity. */
  total: number;
  leadTimeDays: number;
  deliveryDate: string;
  /** Arrives on or before the date the shortage first hits (or no date given). */
  onTime: boolean;
  compliance: ComplianceResult;
}

export type SourcingOutcome =
  /** An eligible, on-time vendor was found. */
  | "ok"
  /** Eligible vendors exist but none can deliver before the shortage date. */
  | "too-slow"
  /** Vendors exist but none is eligible; staff must decide or substitute. */
  | "no-compliant-vendor"
  /** Nobody on file supplies this ingredient. */
  | "no-vendor";

export interface VendorSourcing {
  ingredientId: string;
  qty: number;
  neededDate?: string;
  options: VendorOption[];
  recommended?: VendorOption;
  outcome: SourcingOutcome;
}

const round = (n: number) => Math.round(n * 100) / 100;

const RANK: Record<ComplianceStatus, number> = { eligible: 0, unverified: 1, blocked: 2 };

/**
 * Rank every vendor that supplies the ingredient. Recommends the cheapest
 * eligible vendor that can deliver in time; never recommends a blocked or
 * unverified vendor. `defaultLeadTimeDays` applies to the ingredient's default vendor.
 */
export function sourceIngredient(
  ingredient: Ingredient,
  qty: number,
  opts: {
    neededDate?: string;
    reference?: Date;
    defaultLeadTimeDays?: number;
    vendors?: Vendor[];
    extraRequired?: CertificationKind[];
  } = {},
): VendorSourcing {
  const reference = opts.reference ?? new Date();
  const vendors = opts.vendors ?? VENDORS;
  const defaultLead = Math.max(1, opts.defaultLeadTimeDays ?? 2);
  const options: VendorOption[] = [];

  for (const vendor of vendors) {
    const explicit = vendor.offers[ingredient.id];
    const offer =
      explicit ??
      (vendor.name === ingredient.vendor
        ? { unitCost: ingredient.unitCost, leadTimeDays: defaultLead }
        : undefined);
    if (!offer) continue;
    const deliveryDate = dateKey(dayAt(offer.leadTimeDays, reference));
    options.push({
      vendorId: vendor.id,
      vendorName: vendor.name,
      unitCost: offer.unitCost,
      total: round(qty * offer.unitCost),
      leadTimeDays: offer.leadTimeDays,
      deliveryDate,
      onTime: !opts.neededDate || deliveryDate <= opts.neededDate,
      compliance: vendorCompliance(vendor, ingredient.id, reference, opts.extraRequired),
    });
  }

  options.sort(
    (a, b) =>
      RANK[a.compliance.status] - RANK[b.compliance.status] ||
      Number(b.onTime) - Number(a.onTime) ||
      a.total - b.total ||
      a.vendorName.localeCompare(b.vendorName),
  );

  const eligible = options.filter((o) => o.compliance.status === "eligible");
  const recommended = eligible.find((o) => o.onTime);
  const outcome: SourcingOutcome = recommended
    ? "ok"
    : eligible.length
      ? "too-slow"
      : options.length
        ? "no-compliant-vendor"
        : "no-vendor";
  return {
    ingredientId: ingredient.id,
    qty,
    ...(opts.neededDate ? { neededDate: opts.neededDate } : {}),
    options,
    ...(recommended ? { recommended } : {}),
    outcome,
  };
}
