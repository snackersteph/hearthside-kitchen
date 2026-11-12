import type { Recipe } from "./recipes";

/** Database catalog installed before the kitchen is initialized. */
export const RECIPE_CATALOG: Recipe[] = import.meta.hot?.data?.["recipeCatalog"] ?? [];
if (import.meta.hot?.data) import.meta.hot.data["recipeCatalog"] = RECIPE_CATALOG;
