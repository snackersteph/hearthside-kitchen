/**
 * Vendor catalog for the Inventory Agent.
 *
 * ALL DATA HERE IS FICTIONAL SAMPLE DATA for the prototype. License numbers and
 * certifications are simulated; the app never contacts a real registry.
 */

export type CertificationKind =
  | "food-safety" // HACCP / safe food handling
  | "seafood-handling"
  | "gluten-free-facility"
  | "halal";

export interface VendorCertification {
  kind: CertificationKind;
  issuer: string;
  /** ISO date (YYYY-MM-DD). */
  expires: string;
  /** false = the record exists but staff have not verified the document. */
  verified: boolean;
}

export interface VendorOffer {
  unitCost: number;
  leadTimeDays: number;
}

export interface Vendor {
  id: string;
  name: string;
  /** Missing license = cannot be verified. */
  licenseNumber?: string;
  /** ISO date (YYYY-MM-DD). */
  licenseExpires?: string;
  certifications: VendorCertification[];
  /**
   * Explicit offers by ingredient id. A vendor that is an ingredient's default
   * vendor (Ingredient.vendor) also offers it at the ingredient's own unitCost.
   */
  offers: Record<string, VendorOffer>;
  notes?: string;
}

const cert = (
  kind: CertificationKind,
  issuer: string,
  expires: string,
  verified = true,
): VendorCertification => ({ kind, issuer, expires, verified });

export const VENDORS: Vendor[] = [
  {
    id: "sysco",
    name: "Sysco",
    licenseNumber: "FD-2291-CA",
    licenseExpires: "2027-06-30",
    certifications: [
      cert("food-safety", "State Dept. of Public Health (sample)", "2027-06-30"),
      cert("gluten-free-facility", "GF Alliance (sample)", "2027-03-01"),
    ],
    offers: {},
  },
  {
    id: "valley-farms",
    name: "Valley Farms",
    licenseNumber: "FD-1187-CA",
    licenseExpires: "2027-03-31",
    // Food-safety certificate lapses soon: eligible, but with a renewal warning.
    certifications: [cert("food-safety", "State Dept. of Public Health (sample)", "2026-11-30")],
    offers: {},
  },
  {
    id: "pacific-seafood",
    name: "Pacific Seafood",
    licenseNumber: "FD-3340-CA",
    licenseExpires: "2027-01-15",
    certifications: [
      cert("food-safety", "State Dept. of Public Health (sample)", "2027-01-15"),
      cert("seafood-handling", "Seafood Safety Board (sample)", "2027-01-15"),
    ],
    offers: {},
  },
  {
    id: "hearth-bakery",
    name: "Hearth Bakery",
    licenseNumber: "FD-4410-CA",
    licenseExpires: "2027-05-20",
    // GF facility certificate is on file but staff have not verified the document.
    certifications: [
      cert("food-safety", "State Dept. of Public Health (sample)", "2027-05-20"),
      cert("gluten-free-facility", "GF Alliance (sample)", "2027-05-20", false),
    ],
    offers: {},
  },
  {
    id: "harbor-fresh",
    name: "Harbor Fresh Seafood",
    licenseNumber: "FD-5502-CA",
    // Expired license: cheapest seafood, but must be blocked.
    licenseExpires: "2026-09-30",
    certifications: [
      cert("food-safety", "State Dept. of Public Health (sample)", "2026-09-30"),
      cert("seafood-handling", "Seafood Safety Board (sample)", "2026-09-30"),
    ],
    offers: {
      salmon: { unitCost: 4.9, leadTimeDays: 1 },
      shrimp: { unitCost: 3.6, leadTimeDays: 1 },
    },
    notes: "Lowest price. License lapsed 2026-09-30.",
  },
  {
    id: "sunrise-coop",
    name: "Sunrise Produce Co-op",
    // No license number on file and an unverified certificate: cannot be verified.
    certifications: [cert("food-safety", "Self-reported (sample)", "2027-01-31", false)],
    offers: {
      vegetables: { unitCost: 2.9, leadTimeDays: 1 },
      carrots: { unitCost: 1.4, leadTimeDays: 1 },
      potatoes: { unitCost: 0.95, leadTimeDays: 1 },
    },
    notes: "Cheapest produce. No license on file.",
  },
  {
    id: "farmstead-poultry",
    name: "Farmstead Poultry",
    licenseNumber: "FD-6120-CA",
    licenseExpires: "2027-08-31",
    certifications: [
      cert("food-safety", "State Dept. of Public Health (sample)", "2027-08-31"),
      cert("halal", "Halal Certification Board (sample)", "2027-08-31"),
    ],
    // Cheaper and halal-certified, but slow to deliver.
    offers: {
      chicken: { unitCost: 2.7, leadTimeDays: 4 },
      turkey: { unitCost: 1.9, leadTimeDays: 4 },
    },
    notes: "Lower price, 4-day lead time.",
  },
];

export const vendorById = (id: string): Vendor | undefined => VENDORS.find((v) => v.id === id);
export const vendorByName = (name: string): Vendor | undefined =>
  VENDORS.find((v) => v.name === name);
