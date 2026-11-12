import "@testing-library/jest-dom/vitest";

if (typeof window !== "undefined") Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

if (typeof window !== "undefined") Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

import { vi } from "vitest";
import fixtures from "./fixtures/catalogs.json";
import { installKitchenCatalog } from "@/lib/kitchen/data";
import type { Recipe } from "@/lib/kitchen/recipes";
import type { Resident } from "@/lib/kitchen/types";
installKitchenCatalog(fixtures.recipes as Recipe[], fixtures.residents as Resident[]);
vi.mock("@/integrations/supabase/client", async () => ({ supabase: (await import("./supabase-memory")).memorySupabase }));
