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

export interface VendorContact {
  /** Person to call or email about orders. */
  name: string;
  role: string;
  phone: string;
  email: string;
}

export interface VendorAddress {
  street: string;
  city: string;
  region: string;
  postalCode: string;
}

export interface Vendor {
  id: string;
  name: string;
  /** Sample contact details. Vendors not in the registry have none. */
  contact?: VendorContact;
  address?: VendorAddress;
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
    contact: {
      name: "Dana Whitfield",
      role: "Account manager",
      phone: "(916) 555-0142",
      email: "dana.whitfield@sysco.example",
    },
    address: {
      street: "1200 Distribution Way",
      city: "Sacramento",
      region: "CA",
      postalCode: "95828",
    },
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
    contact: {
      name: "Miguel Alvarez",
      role: "Farm sales lead",
      phone: "(209) 555-0178",
      email: "miguel.alvarez@valleyfarms.example",
    },
    address: { street: "48 Orchard Road", city: "Modesto", region: "CA", postalCode: "95350" },
    licenseNumber: "FD-1187-CA",
    licenseExpires: "2027-03-31",
    // Food-safety certificate lapses soon: eligible, but with a renewal warning.
    certifications: [cert("food-safety", "State Dept. of Public Health (sample)", "2026-11-30")],
    offers: {},
  },
  {
    id: "pacific-seafood",
    name: "Pacific Seafood",
    contact: {
      name: "Hana Kobayashi",
      role: "Seafood accounts",
      phone: "(510) 555-0119",
      email: "hana.kobayashi@pacificseafood.example",
    },
    address: { street: "22 Wharf Street", city: "Oakland", region: "CA", postalCode: "94607" },
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
    contact: {
      name: "Tom Bennett",
      role: "Wholesale manager",
      phone: "(415) 555-0163",
      email: "tom.bennett@hearthbakery.example",
    },
    address: { street: "305 Baker Lane", city: "San Francisco", region: "CA", postalCode: "94110" },
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
    contact: {
      name: "Luis Ortega",
      role: "Sales representative",
      phone: "(831) 555-0127",
      email: "orders@harborfresh.example",
    },
    address: { street: "9 Pier Avenue", city: "Monterey", region: "CA", postalCode: "93940" },
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
    contact: {
      name: "Priya Nair",
      role: "Co-op coordinator",
      phone: "(530) 555-0154",
      email: "priya.nair@sunrisecoop.example",
    },
    address: { street: "77 Market Hall Road", city: "Davis", region: "CA", postalCode: "95616" },
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
    contact: {
      name: "Grace Holloway",
      role: "Customer accounts",
      phone: "(707) 555-0188",
      email: "grace.holloway@farmsteadpoultry.example",
    },
    address: { street: "640 Ridge Road", city: "Petaluma", region: "CA", postalCode: "94952" },
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
