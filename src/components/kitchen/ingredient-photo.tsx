import photo0 from "@/assets/ingredient-carrots.jpg";
import photo1 from "@/assets/ingredient-potatoes.jpg";
import photo2 from "@/assets/ingredient-sweet-potato.jpg";
import photo3 from "@/assets/ingredient-garlic.jpg";
import photo4 from "@/assets/ingredient-vegetables.jpg";
import photo5 from "@/assets/ingredient-spinach.jpg";
import photo6 from "@/assets/ingredient-broccoli.jpg";
import photo7 from "@/assets/ingredient-berries.jpg";
import photo8 from "@/assets/ingredient-banana.jpg";
import photo9 from "@/assets/ingredient-apples.jpg";
import photo10 from "@/assets/ingredient-oranges.jpg";
import photo11 from "@/assets/ingredient-chicken.jpg";
import photo12 from "@/assets/ingredient-turkey.jpg";
import photo13 from "@/assets/ingredient-salmon.jpg";
import photo14 from "@/assets/ingredient-shrimp.jpg";
import photo15 from "@/assets/ingredient-eggs.jpg";
import photo16 from "@/assets/ingredient-milk.jpg";
import photo17 from "@/assets/ingredient-cream.jpg";
import photo18 from "@/assets/ingredient-parmesan.jpg";
import photo19 from "@/assets/ingredient-butter.jpg";
import photo20 from "@/assets/ingredient-yogurt.jpg";
import photo21 from "@/assets/ingredient-oat-milk.jpg";
import photo22 from "@/assets/ingredient-flour.jpg";
import photo23 from "@/assets/ingredient-oats.jpg";
import photo24 from "@/assets/ingredient-bread.jpg";
import photo25 from "@/assets/ingredient-gf-bread.jpg";
import photo26 from "@/assets/ingredient-pasta.jpg";
import photo27 from "@/assets/ingredient-gf-pasta.jpg";
import photo28 from "@/assets/ingredient-rice.jpg";
import photo29 from "@/assets/ingredient-quinoa.jpg";
import photo30 from "@/assets/ingredient-lentils.jpg";
import photo31 from "@/assets/ingredient-tofu.jpg";
import photo32 from "@/assets/ingredient-olive-oil.jpg";
import photo33 from "@/assets/ingredient-chickpeas.jpg";
import photo34 from "@/assets/ingredient-peas.jpg";
import type { Ingredient } from "@/lib/kitchen/types";
import { ImageIcon } from "lucide-react";
const photos: Record<string, string> = {
  "carrots": photo0,
  "potatoes": photo1,
  "sweet-potato": photo2,
  "garlic": photo3,
  "vegetables": photo4,
  "spinach": photo5,
  "broccoli": photo6,
  "berries": photo7,
  "banana": photo8,
  "apples": photo9,
  "oranges": photo10,
  "chicken": photo11,
  "turkey": photo12,
  "salmon": photo13,
  "shrimp": photo14,
  "eggs": photo15,
  "milk": photo16,
  "cream": photo17,
  "parmesan": photo18,
  "butter": photo19,
  "yogurt": photo20,
  "oat-milk": photo21,
  "flour": photo22,
  "oats": photo23,
  "bread": photo24,
  "gf-bread": photo25,
  "pasta": photo26,
  "gf-pasta": photo27,
  "rice": photo28,
  "quinoa": photo29,
  "lentils": photo30,
  "tofu": photo31,
  "olive-oil": photo32,
  "chickpeas": photo33,
  "peas": photo34
};
export function IngredientPhoto({ ingredient }: { ingredient: Ingredient }) {
 const src = ingredient.photoUrl || photos[ingredient.id];
 return src ? <img src={src} alt={`${ingredient.name} photo`} width={256} height={256} loading="lazy" className="h-14 w-14 shrink-0 rounded-md border bg-card object-cover" /> : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground"><ImageIcon aria-label="No ingredient photo" /></span>;
}
