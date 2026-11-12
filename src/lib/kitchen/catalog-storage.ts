import { supabase } from "@/integrations/supabase/client";
import { installKitchenCatalog } from "./data";
import type { Recipe } from "./recipes";
import type { KitchenState, Resident } from "./types";

export async function loadKitchenCatalogs() {
  const [recipes, residents] = await Promise.all([
    supabase.from("recipes").select("data, deleted").order("sort_order"),
    supabase.from("residents").select("data, deleted").order("sort_order"),
  ]);
  if (recipes.error || residents.error || !recipes.data?.length || !residents.data) throw new Error("Could not load kitchen records");
  // Deleted recipes remain resolvable in historical menus, but not in the library.
  const recipeData = recipes.data.map((r) => r.data as unknown as Recipe);
  const residentData = residents.data.filter((r) => !r.deleted).map((r) => r.data as unknown as Resident);
  installKitchenCatalog(recipeData, residentData);
  return { recipes: recipeData, residents: residentData, deletedRecipeIds: recipes.data.filter((r) => r.deleted).map((r) => (r.data as unknown as Recipe).id) };
}

/** Dedicated tables override old snapshot copies only after historical actions are replayed. */
export function withKitchenCatalogs(state: KitchenState, catalogs: Awaited<ReturnType<typeof loadKitchenCatalogs>>): KitchenState {
  return { ...state, ...catalogs, additionalResidentsVersion: 1, residentProfileVersion: 1 };
}