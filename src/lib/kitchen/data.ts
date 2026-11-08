import type { Dish, Ingredient, KitchenState, Resident } from "./types";

export const DISHES: Dish[] = [
  // Breakfast
  { id: "b-pancakes", name: "Buttermilk Pancakes & Berries", meal: "breakfast", description: "Fluffy buttermilk pancakes, warm berry compote, maple syrup.", allergens: ["dairy", "gluten", "egg"], tags: ["vegetarian", "high-sugar", "soft"], ingredients: [{ id: "flour", qty: 0.15 }, { id: "milk", qty: 0.2 }, { id: "eggs", qty: 1 }, { id: "berries", qty: 0.1 }] },
  { id: "b-oatmeal", name: "Steel-Cut Oatmeal & Berries", meal: "breakfast", description: "Certified gluten-free oats cooked in oat milk, fresh berries.", allergens: [], tags: ["vegetarian", "soft"], ingredients: [{ id: "oats", qty: 0.1 }, { id: "oat-milk", qty: 0.25 }, { id: "berries", qty: 0.08 }] },
  { id: "b-eggs", name: "Soft Scrambled Eggs & Toast", meal: "breakfast", description: "Creamy scrambled eggs with buttered sourdough toast.", allergens: ["egg", "gluten", "dairy"], tags: ["vegetarian", "soft"], ingredients: [{ id: "eggs", qty: 2 }, { id: "bread", qty: 2 }, { id: "milk", qty: 0.05 }] },
  { id: "b-tofu", name: "Tofu Scramble & GF Toast", meal: "breakfast", description: "Turmeric tofu scramble, spinach, gluten-free toast.", allergens: ["soy"], tags: ["vegetarian", "soft"], ingredients: [{ id: "tofu", qty: 0.25 }, { id: "gf-bread", qty: 2 }, { id: "vegetables", qty: 0.1 }] },
  { id: "b-smoothie", name: "Banana-Oat Breakfast Purée", meal: "breakfast", description: "Smooth banana, oat and berry purée (IDDSI level 4).", allergens: [], tags: ["vegetarian", "soft", "pureed"], ingredients: [{ id: "oats", qty: 0.05 }, { id: "oat-milk", qty: 0.2 }, { id: "berries", qty: 0.05 }] },
  // Lunch
  { id: "l-alfredo", name: "Creamy Chicken Alfredo", meal: "lunch", description: "Penne, grilled chicken, parmesan cream sauce.", allergens: ["dairy", "gluten"], tags: ["high-sodium"], ingredients: [{ id: "chicken", qty: 1 }, { id: "pasta", qty: 0.2 }, { id: "cream", qty: 0.15 }, { id: "parmesan", qty: 0.05 }] },
  { id: "l-primavera", name: "Dairy-Free Chicken Primavera", meal: "lunch", description: "Gluten-free penne, chicken, spring vegetables, olive oil & herbs.", allergens: [], tags: [], ingredients: [{ id: "chicken", qty: 1 }, { id: "gf-pasta", qty: 0.2 }, { id: "vegetables", qty: 0.15 }] },
  { id: "l-lentil", name: "Lentil & Vegetable Soup", meal: "lunch", description: "Low-sodium red lentil soup with carrots and celery.", allergens: [], tags: ["vegetarian", "soft"], ingredients: [{ id: "lentils", qty: 0.12 }, { id: "vegetables", qty: 0.2 }] },
  { id: "l-club", name: "Turkey Club Sandwich", meal: "lunch", description: "Roast turkey, bacon, tomato, mayo on toasted wheat.", allergens: ["gluten", "egg"], tags: ["high-sodium"], ingredients: [{ id: "turkey", qty: 1 }, { id: "bread", qty: 3 }] },
  { id: "l-puree", name: "Puréed Chicken & Sweet Potato", meal: "lunch", description: "Smooth chicken and sweet potato purée (IDDSI level 4).", allergens: [], tags: ["soft", "pureed"], ingredients: [{ id: "chicken", qty: 0.6 }, { id: "potatoes", qty: 0.2 }] },
  // Dinner
  { id: "d-salmon", name: "Herb-Baked Salmon & Rice", meal: "dinner", description: "Lemon-dill salmon, jasmine rice, tender green beans.", allergens: ["fish"], tags: ["soft"], ingredients: [{ id: "salmon", qty: 1 }, { id: "rice", qty: 0.15 }, { id: "vegetables", qty: 0.12 }] },
  { id: "d-chicken", name: "Roast Chicken & Mashed Potatoes", meal: "dinner", description: "Herb roast chicken, buttery mash, glazed carrots.", allergens: ["dairy"], tags: ["soft"], ingredients: [{ id: "chicken", qty: 1 }, { id: "potatoes", qty: 0.3 }, { id: "milk", qty: 0.05 }] },
  { id: "d-shrimp", name: "Garlic Shrimp Scampi", meal: "dinner", description: "Shrimp, linguine, garlic butter and white wine.", allergens: ["shellfish", "gluten", "dairy"], tags: ["high-sodium"], ingredients: [{ id: "shrimp", qty: 1 }, { id: "pasta", qty: 0.2 }] },
  { id: "d-quinoa", name: "Roasted Vegetable Quinoa Bowl", meal: "dinner", description: "Quinoa, roasted squash, chickpeas, tahini-free herb dressing.", allergens: [], tags: ["vegetarian"], ingredients: [{ id: "quinoa", qty: 0.12 }, { id: "vegetables", qty: 0.25 }] },
  { id: "d-puree", name: "Puréed Salmon & Carrot", meal: "dinner", description: "Smooth salmon and carrot purée (IDDSI level 4).", allergens: ["fish"], tags: ["soft", "pureed"], ingredients: [{ id: "salmon", qty: 0.6 }, { id: "vegetables", qty: 0.1 }] },
  { id: "d-lentil-puree", name: "Puréed Lentil Dal", meal: "dinner", description: "Mild, smooth red lentil dal (IDDSI level 4).", allergens: [], tags: ["vegetarian", "soft", "pureed"], ingredients: [{ id: "lentils", qty: 0.1 }, { id: "vegetables", qty: 0.05 }] },
];

export const INGREDIENTS: Ingredient[] = [
  { id: "chicken", name: "Chicken breast", unit: "portions", stock: 6, onOrder: 0, vendor: "Sysco", packSize: 4, unitCost: 3.2 },
  { id: "salmon", name: "Salmon fillet", unit: "portions", stock: 9, onOrder: 0, vendor: "Pacific Seafood", packSize: 5, unitCost: 5.8 },
  { id: "shrimp", name: "Shrimp", unit: "portions", stock: 4, onOrder: 0, vendor: "Pacific Seafood", packSize: 5, unitCost: 4.5 },
  { id: "turkey", name: "Sliced turkey", unit: "portions", stock: 10, onOrder: 0, vendor: "Sysco", packSize: 10, unitCost: 2.1 },
  { id: "eggs", name: "Eggs", unit: "each", stock: 30, onOrder: 0, vendor: "Valley Farms", packSize: 12, unitCost: 0.35 },
  { id: "milk", name: "Whole milk", unit: "L", stock: 2, onOrder: 0, vendor: "Valley Farms", packSize: 2, unitCost: 1.4 },
  { id: "oat-milk", name: "Oat milk", unit: "L", stock: 1, onOrder: 0, vendor: "Valley Farms", packSize: 1, unitCost: 2.6 },
  { id: "cream", name: "Heavy cream", unit: "L", stock: 3, onOrder: 0, vendor: "Valley Farms", packSize: 1, unitCost: 4.1 },
  { id: "parmesan", name: "Parmesan", unit: "kg", stock: 1, onOrder: 0, vendor: "Sysco", packSize: 1, unitCost: 18 },
  { id: "flour", name: "Pancake mix", unit: "kg", stock: 4, onOrder: 0, vendor: "Sysco", packSize: 2, unitCost: 2.4 },
  { id: "oats", name: "GF steel-cut oats", unit: "kg", stock: 2, onOrder: 0, vendor: "Sysco", packSize: 1, unitCost: 4.2 },
  { id: "berries", name: "Mixed berries", unit: "kg", stock: 1.5, onOrder: 0, vendor: "Valley Farms", packSize: 1, unitCost: 7.5 },
  { id: "bread", name: "Sourdough bread", unit: "slices", stock: 24, onOrder: 0, vendor: "Hearth Bakery", packSize: 20, unitCost: 0.25 },
  { id: "gf-bread", name: "Gluten-free bread", unit: "slices", stock: 4, onOrder: 0, vendor: "Hearth Bakery", packSize: 12, unitCost: 0.55 },
  { id: "tofu", name: "Firm tofu", unit: "kg", stock: 1, onOrder: 0, vendor: "Sysco", packSize: 1, unitCost: 5 },
  { id: "pasta", name: "Penne pasta", unit: "kg", stock: 5, onOrder: 0, vendor: "Sysco", packSize: 2, unitCost: 2 },
  { id: "gf-pasta", name: "Gluten-free penne", unit: "kg", stock: 0.5, onOrder: 0, vendor: "Sysco", packSize: 1, unitCost: 4.8 },
  { id: "vegetables", name: "Seasonal vegetables", unit: "kg", stock: 6, onOrder: 0, vendor: "Valley Farms", packSize: 2, unitCost: 3.5 },
  { id: "lentils", name: "Red lentils", unit: "kg", stock: 3, onOrder: 0, vendor: "Sysco", packSize: 1, unitCost: 2.8 },
  { id: "potatoes", name: "Potatoes", unit: "kg", stock: 6, onOrder: 0, vendor: "Valley Farms", packSize: 5, unitCost: 1.2 },
  { id: "rice", name: "Jasmine rice", unit: "kg", stock: 5, onOrder: 0, vendor: "Sysco", packSize: 5, unitCost: 2.2 },
  { id: "quinoa", name: "Quinoa", unit: "kg", stock: 0.6, onOrder: 0, vendor: "Sysco", packSize: 1, unitCost: 6.5 },
];

export const RESIDENTS: Resident[] = [
  { id: "r1", name: "Margaret Ellis", room: "102", age: 84, allergens: ["dairy"], diets: [], likes: ["Pasta", "Tea"], notes: "Lactose intolerant; enjoys Italian dishes." },
  { id: "r2", name: "Harold Brooks", room: "104", age: 88, allergens: [], diets: ["diabetic", "low-sodium"], likes: ["Fish", "Oatmeal"], notes: "Type 2 diabetes. Monitor carbohydrate portions." },
  { id: "r3", name: "Dorothy Chen", room: "107", age: 79, allergens: ["gluten"], diets: [], likes: ["Rice", "Soup"], notes: "Celiac disease — strict avoidance, no cross-contact." },
  { id: "r4", name: "Walter Kim", room: "110", age: 91, allergens: [], diets: ["pureed"], likes: ["Sweet potato"], notes: "Dysphagia — IDDSI level 4 puréed only." },
  { id: "r5", name: "Evelyn Russo", room: "112", age: 86, allergens: [], diets: [], likes: ["Pancakes", "Chicken"], notes: "No restrictions. Small appetite at dinner." },
  { id: "r6", name: "Frank Okafor", room: "115", age: 82, allergens: ["shellfish", "fish"], diets: [], likes: ["Chicken", "Rice"], notes: "Severe seafood allergy — carries EpiPen." },
  { id: "r7", name: "Ruth Alvarez", room: "118", age: 90, allergens: ["dairy"], diets: ["vegetarian"], likes: ["Lentils", "Vegetables"], notes: "Lifelong vegetarian; avoids dairy." },
  { id: "r8", name: "George Patel", room: "201", age: 85, allergens: [], diets: ["low-sodium"], likes: ["Soup", "Quinoa"], notes: "Congestive heart failure — under 1,500 mg sodium/day." },
  { id: "r9", name: "Betty Larsen", room: "203", age: 87, allergens: ["nuts", "egg"], diets: [], likes: ["Berries"], notes: "Egg and tree-nut allergy." },
  { id: "r10", name: "Arthur Nguyen", room: "205", age: 83, allergens: [], diets: ["soft"], likes: ["Salmon", "Rice"], notes: "Dentures — soft textures preferred." },
  { id: "r11", name: "Helen Whitaker", room: "208", age: 80, allergens: [], diets: [], likes: ["Sandwiches"], notes: "No restrictions." },
  { id: "r12", name: "Samuel Moreno", room: "210", age: 89, allergens: ["dairy"], diets: ["diabetic"], likes: ["Chicken", "Eggs"], notes: "Lactose intolerant, insulin-managed diabetes." },
  { id: "r13", name: "Lillian Grant", room: "212", age: 92, allergens: ["gluten"], diets: ["soft"], likes: ["Oatmeal", "Fish"], notes: "Gluten sensitivity; soft foods after dental surgery." },
  { id: "r14", name: "Clarence Doyle", room: "215", age: 78, allergens: [], diets: [], likes: ["Shrimp", "Pasta"], notes: "No restrictions. Hearty eater." },
];

export function initialState(): KitchenState {
  return {
    plan: { breakfast: "b-pancakes", lunch: "l-alfredo", dinner: "d-salmon" },
    overrides: { breakfast: {}, lunch: {}, dinner: {} },
    residents: RESIDENTS.map((r) => ({ ...r })),
    ingredients: INGREDIENTS.map((i) => ({ ...i })),
    history: [],
  };
}

export const dishById = (id: string) => DISHES.find((d) => d.id === id)!;
