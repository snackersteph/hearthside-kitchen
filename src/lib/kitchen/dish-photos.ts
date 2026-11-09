import oatmeal from "@/assets/dishes/oatmeal.jpg";
import pancakes from "@/assets/dishes/pancakes.jpg";
import eggs from "@/assets/dishes/eggs.jpg";
import congee from "@/assets/dishes/congee.jpg";
import rice from "@/assets/dishes/rice.jpg";
import hash from "@/assets/dishes/hash.jpg";
import soup from "@/assets/dishes/soup.jpg";
import pasta from "@/assets/dishes/pasta.jpg";
import salmon from "@/assets/dishes/salmon.jpg";
import chicken from "@/assets/dishes/chicken.jpg";
import puree from "@/assets/dishes/puree.jpg";
import bowl from "@/assets/dishes/bowl.jpg";
import sandwich from "@/assets/dishes/sandwich.jpg";
import lentil from "@/assets/dishes/lentil.jpg";
import pudding from "@/assets/dishes/pudding.jpg";
import roast from "@/assets/dishes/roast.jpg";

/** Representative photo per dish style, matched from the dish name (first rule wins). */
const RULES: [RegExp, string][] = [
  [/pur[ée]e/i, puree], [/pudding|custard|oat bake/i, pudding], [/soup|chowder/i, soup], [/congee|porridge/i, congee],
  [/pancake|french toast/i, pancakes], [/oatmeal|oat/i, oatmeal], [/pasta|alfredo|primavera|penne|scampi|linguine/i, pasta],
  [/sandwich|toast|club/i, sandwich], [/fried rice|rice bowl/i, rice], [/hash|skillet|potato|mash/i, hash], [/omelette|scramble|egg|frittata/i, eggs],
  [/lentil|dal|stew|curry|chickpea/i, lentil], [/fried rice|rice/i, rice], [/quinoa|tofu|bowl|vegetable/i, bowl],
  [/salmon|fish/i, salmon], [/chicken/i, chicken], [/turkey|shrimp|roast/i, roast],
];
export const dishPhoto = (name: string) => RULES.find(([re]) => re.test(name))?.[1] ?? bowl;
