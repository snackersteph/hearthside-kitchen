import { describe, expect, it } from "vitest";
import { INGREDIENTS } from "@/lib/kitchen/data";
import {
  requiredCertifications,
  sourceIngredient,
  vendorCompliance,
} from "@/lib/kitchen/vendor-engine";
import { vendorById } from "@/lib/kitchen/vendors";

const reference = new Date("2026-11-09T12:00:00");
const ing = (id: string) => {
  const found = INGREDIENTS.find((i) => i.id === id);
  if (!found) throw new Error(`missing ingredient ${id}`);
  return found;
};
const vendor = (id: string) => {
  const found = vendorById(id);
  if (!found) throw new Error(`missing vendor ${id}`);
  return found;
};

describe("vendor compliance", () => {
  it("passes a vendor with valid, verified paperwork", () => {
    expect(vendorCompliance(vendor("sysco"), "chicken", reference)).toEqual({
      status: "eligible",
      reasons: [],
      warnings: [],
    });
  });

  it("blocks a vendor whose license has expired", () => {
    const result = vendorCompliance(vendor("harbor-fresh"), "shrimp", reference);
    expect(result.status).toBe("blocked");
    expect(result.reasons).toContain("license expired 2026-09-30");
  });

  it("marks a vendor with no license on file as unverified, not blocked", () => {
    const result = vendorCompliance(vendor("sunrise-coop"), "vegetables", reference);
    expect(result.status).toBe("unverified");
    expect(result.reasons).toContain("no license on file");
    expect(result.reasons).toContain("food-safety certification not verified");
  });

  it("blocks when a required certification is missing", () => {
    // Pacific Seafood has no gluten-free facility certificate.
    const result = vendorCompliance(vendor("pacific-seafood"), "gf-bread", reference);
    expect(result.status).toBe("blocked");
    expect(result.reasons).toContain("missing gluten-free facility certification");
  });

  it("treats an unverified certification document as unverified", () => {
    const result = vendorCompliance(vendor("hearth-bakery"), "gf-bread", reference);
    expect(result.status).toBe("unverified");
    expect(result.reasons).toEqual(["gluten-free facility certification not verified"]);
  });

  it("stays eligible but warns when a certificate expires within 30 days", () => {
    const result = vendorCompliance(vendor("valley-farms"), "vegetables", reference);
    expect(result.status).toBe("eligible");
    expect(result.warnings).toEqual(["food-safety certification expires 2026-11-30"]);
  });

  it("requires seafood handling for fish and shellfish only", () => {
    expect(requiredCertifications("salmon")).toContain("seafood-handling");
    expect(requiredCertifications("shrimp")).toContain("seafood-handling");
    expect(requiredCertifications("chicken")).toEqual(["food-safety"]);
  });

  it("honors extra required certifications such as halal", () => {
    expect(vendorCompliance(vendor("sysco"), "chicken", reference, ["halal"]).status).toBe(
      "blocked",
    );
    expect(
      vendorCompliance(vendor("farmstead-poultry"), "chicken", reference, ["halal"]).status,
    ).toBe("eligible");
  });
});

describe("vendor sourcing", () => {
  it("recommends an eligible on-time vendor over a cheaper one that is too slow", () => {
    // Farmstead is cheaper (2.70 vs 3.20) but delivers in 4 days; Sysco in 2.
    const s = sourceIngredient(ing("chicken"), 8, { neededDate: "2026-11-12", reference });
    expect(s.outcome).toBe("ok");
    expect(s.recommended?.vendorId).toBe("sysco");
    const farmstead = s.options.find((o) => o.vendorId === "farmstead-poultry");
    expect(farmstead?.onTime).toBe(false);
    expect(farmstead?.total).toBeLessThan(s.recommended?.total ?? 0);
  });

  it("reports too-slow when only late vendors are eligible", () => {
    const s = sourceIngredient(ing("chicken"), 8, { neededDate: "2026-11-10", reference });
    expect(s.outcome).toBe("too-slow");
    expect(s.recommended).toBeUndefined();
  });

  it("never recommends the cheapest vendor when it is blocked", () => {
    const s = sourceIngredient(ing("shrimp"), 10, { neededDate: "2026-11-12", reference });
    const cheapest = [...s.options].sort((a, b) => a.total - b.total)[0];
    expect(cheapest?.vendorId).toBe("harbor-fresh");
    expect(cheapest?.compliance.status).toBe("blocked");
    expect(s.recommended?.vendorId).toBe("pacific-seafood");
    expect(s.outcome).toBe("ok");
  });

  it("never recommends an unverified vendor", () => {
    const s = sourceIngredient(ing("vegetables"), 10, { neededDate: "2026-11-12", reference });
    expect(s.options.find((o) => o.vendorId === "sunrise-coop")?.compliance.status).toBe(
      "unverified",
    );
    expect(s.recommended?.vendorId).toBe("valley-farms");
  });

  it("reports no-compliant-vendor when every supplier has a problem", () => {
    const s = sourceIngredient(ing("gf-bread"), 12, { neededDate: "2026-11-12", reference });
    expect(s.outcome).toBe("no-compliant-vendor");
    expect(s.recommended).toBeUndefined();
    expect(s.options).toHaveLength(1);
  });

  it("reports no-vendor when nobody supplies the ingredient", () => {
    const orphan = { ...ing("chicken"), id: "dragonfruit", vendor: "Nobody Ltd" };
    expect(sourceIngredient(orphan, 3, { reference }).outcome).toBe("no-vendor");
  });

  it("uses the shared lead time for the default vendor and prices the requested quantity", () => {
    const s = sourceIngredient(ing("chicken"), 8, { reference, defaultLeadTimeDays: 3 });
    const sysco = s.options.find((o) => o.vendorId === "sysco");
    expect(sysco?.deliveryDate).toBe("2026-11-12");
    expect(sysco?.total).toBe(25.6);
  });

  it("lists eligible vendors before unverified and blocked ones", () => {
    const s = sourceIngredient(ing("shrimp"), 10, { reference });
    expect(s.options.map((o) => o.compliance.status)).toEqual(["eligible", "blocked"]);
  });
});
