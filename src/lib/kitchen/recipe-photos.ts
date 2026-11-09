import { dishPhoto } from "@/lib/kitchen/dish-photos";


/** Unique generated photo per catalog recipe, keyed by recipe id. */
const PHOTOS: Record<string, string> = {
};

/** Photo for a recipe: its unique catalog photo, or a style match by name for user-added recipes. */
export const recipePhoto = (id: string, name: string) => PHOTOS[id] ?? dishPhoto(name);
