import type { Dish, Ingredient, KitchenState, Resident } from "./types";
import { ADDITIONAL_RESIDENTS } from "./additional-residents";

export const DISHES: Dish[] = [
  // Breakfast
  { id: "b-pancakes", name: "Buttermilk Pancakes & Berries", meal: "breakfast", description: "Fluffy buttermilk pancakes, warm berry compote, maple syrup.", allergens: ["dairy", "gluten", "egg"], tags: ["vegetarian", "high-sugar", "soft"], ingredients: [{ id: "flour", qty: 0.15 }, { id: "milk", qty: 0.2 }, { id: "eggs", qty: 1 }, { id: "berries", qty: 0.1 }] },
  { id: "b-oatmeal", name: "Steel-Cut Oatmeal & Berries", meal: "breakfast", description: "Certified gluten-free oats cooked in oat milk, fresh berries.", allergens: [], tags: ["vegetarian", "soft"], ingredients: [{ id: "oats", qty: 0.1 }, { id: "oat-milk", qty: 0.25 }, { id: "berries", qty: 0.08 }] },
  { id: "b-eggs", name: "Soft Scrambled Eggs & Toast", meal: "breakfast", description: "Creamy scrambled eggs with buttered sourdough toast.", allergens: ["egg", "gluten", "dairy"], tags: ["vegetarian", "soft"], ingredients: [{ id: "eggs", qty: 2 }, { id: "bread", qty: 2 }, { id: "milk", qty: 0.05 }, { id: "butter", qty: 10, unit: "g" }] },
  { id: "b-tofu", name: "Tofu Scramble & GF Toast", meal: "breakfast", description: "Turmeric tofu scramble, spinach, gluten-free toast.", allergens: ["soy"], tags: ["vegetarian", "soft"], ingredients: [{ id: "tofu", qty: 0.25 }, { id: "gf-bread", qty: 2 }, { id: "vegetables", qty: 0.1 }] },
  { id: "b-smoothie", name: "Banana-Oat Breakfast Purée", meal: "breakfast", description: "Smooth banana, oat and berry purée (IDDSI level 4).", allergens: [], tags: ["vegetarian", "soft", "pureed"], ingredients: [{ id: "oats", qty: 0.05 }, { id: "oat-milk", qty: 0.2 }, { id: "berries", qty: 0.05 }, { id: "banana", qty: 1 }] },
  // Lunch
  { id: "l-alfredo", name: "Creamy Chicken Alfredo", meal: "lunch", description: "Penne, grilled chicken, parmesan cream sauce.", allergens: ["dairy", "gluten"], tags: ["high-sodium"], ingredients: [{ id: "chicken", qty: 1 }, { id: "pasta", qty: 0.2 }, { id: "cream", qty: 0.15 }, { id: "parmesan", qty: 0.05 }] },
  { id: "l-primavera", name: "Dairy-Free Chicken Primavera", meal: "lunch", description: "Gluten-free penne, chicken, spring vegetables, olive oil & herbs.", allergens: [], tags: [], ingredients: [{ id: "chicken", qty: 1 }, { id: "gf-pasta", qty: 0.2 }, { id: "vegetables", qty: 0.15 }, { id: "olive-oil", qty: 15, unit: "ml" }] },
  { id: "l-lentil", name: "Lentil & Vegetable Soup", meal: "lunch", description: "Low-sodium red lentil soup with carrots and celery.", allergens: [], tags: ["vegetarian", "soft"], ingredients: [{ id: "lentils", qty: 0.12 }, { id: "vegetables", qty: 0.2 }] },
  { id: "l-club", name: "Turkey Club Sandwich", meal: "lunch", description: "Roast turkey, bacon, tomato, mayo on toasted wheat.", allergens: ["gluten", "egg"], tags: ["high-sodium"], ingredients: [{ id: "turkey", qty: 1 }, { id: "bread", qty: 3 }] },
  { id: "l-puree", name: "Puréed Chicken & Sweet Potato", meal: "lunch", description: "Smooth chicken and sweet potato purée (IDDSI level 4).", allergens: [], tags: ["soft", "pureed"], ingredients: [{ id: "chicken", qty: 0.6 }, { id: "sweet-potato", qty: 200, unit: "g" }] },
  // Dinner
  { id: "d-salmon", name: "Herb-Baked Salmon & Rice", meal: "dinner", description: "Lemon-dill salmon, jasmine rice, tender green beans.", allergens: ["fish"], tags: ["soft"], ingredients: [{ id: "salmon", qty: 1 }, { id: "rice", qty: 0.15 }, { id: "vegetables", qty: 0.12 }] },
  { id: "d-chicken", name: "Roast Chicken & Mashed Potatoes", meal: "dinner", description: "Herb roast chicken, buttery mash, glazed carrots.", allergens: ["dairy"], tags: ["soft"], ingredients: [{ id: "chicken", qty: 1 }, { id: "potatoes", qty: 0.3 }, { id: "milk", qty: 0.05 }, { id: "carrots", qty: 80, unit: "g" }, { id: "butter", qty: 15, unit: "g" }] },
  { id: "d-shrimp", name: "Garlic Shrimp Scampi", meal: "dinner", description: "Shrimp, linguine, garlic butter and white wine.", allergens: ["shellfish", "gluten", "dairy"], tags: ["high-sodium"], ingredients: [{ id: "shrimp", qty: 1 }, { id: "pasta", qty: 0.2 }, { id: "garlic", qty: 10, unit: "g" }, { id: "butter", qty: 20, unit: "g" }] },
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
  { id: "banana", name: "Bananas", unit: "each", stock: 20, onOrder: 0, vendor: "Valley Farms", packSize: 12, unitCost: 0.3 },
  { id: "sweet-potato", name: "Sweet potatoes", unit: "kg", stock: 4, onOrder: 0, vendor: "Valley Farms", packSize: 2, unitCost: 2.8 },
  { id: "carrots", name: "Carrots", unit: "kg", stock: 5, onOrder: 0, vendor: "Valley Farms", packSize: 2, unitCost: 1.8 },
  { id: "olive-oil", name: "Olive oil", unit: "L", stock: 2, onOrder: 0, vendor: "Sysco", packSize: 1, unitCost: 9 },
  { id: "garlic", name: "Garlic", unit: "kg", stock: 0.5, onOrder: 0, vendor: "Valley Farms", packSize: 0.5, unitCost: 6 },
  { id: "butter", name: "Butter", unit: "kg", stock: 1, onOrder: 0, vendor: "Valley Farms", packSize: 0.5, unitCost: 7 },
];

export const RESIDENT_PROFILE_VERSION = 1;

export const RESIDENTS: Resident[] = [
  {
    "id": "R001",
    "name": "Margaret Wilson",
    "age": 82,
    "room": "104",
    "allergens": [],
    "diets": [
      "diabetic"
    ],
    "likes": [
      "Oatmeal",
      "salmon",
      "blueberries",
      "roasted chicken",
      "green vegetables"
    ],
    "notes": "Medical conditions: Type 2 diabetes\nNutritional priority: Support consistent carbohydrate intake and balanced blood glucose management\nDistribute carbohydrate intake consistently throughout the day according to her approved meal plan.\nPrefer whole grains and fiber-rich vegetables.\nOffer unsweetened beverages by default.\nAvoid unnecessarily large servings of sugary desserts.",
    "careProfile": {
      "Gender": "Female",
      "Mobility": "Walks independently",
      "Eating Assistance": "Independent",
      "Diet Type": "Consistent carbohydrate diet",
      "Food Allergies": "None known",
      "Texture Requirement": "Regular",
      "Swallowing Difficulties": "None",
      "Disliked Foods": "Mushrooms, spicy dishes, overly sweet desserts",
      "Preferred Cuisine": "American, Mediterranean",
      "Preferred Beverages": "Water, unsweetened tea",
      "Portion Preference": "Medium"
    },
    "mealInstructions": [
      "Distribute carbohydrate intake consistently throughout the day according to her approved meal plan.",
      "Prefer whole grains and fiber-rich vegetables.",
      "Offer unsweetened beverages by default.",
      "Avoid unnecessarily large servings of sugary desserts."
    ]
  },
  {
    "id": "R002",
    "name": "Robert Chen",
    "age": 78,
    "room": "105",
    "allergens": [],
    "diets": [
      "low-sodium"
    ],
    "likes": [
      "Steamed fish",
      "rice",
      "bok choy",
      "tofu",
      "vegetable soup"
    ],
    "notes": "Medical conditions: Hypertension\nNutritional priority: Limit sodium intake while maintaining balanced nutrition\nAvoid high-sodium sauces and broths.\nUse herbs, ginger, garlic, and other seasonings for flavor.\nOffer steamed or baked dishes more frequently than fried dishes.\nKeep sodium within the resident's approved dietary target.",
    "careProfile": {
      "Gender": "Male",
      "Mobility": "Independent",
      "Eating Assistance": "Independent",
      "Diet Type": "Low sodium",
      "Food Allergies": "None known",
      "Texture Requirement": "Regular",
      "Swallowing Difficulties": "None",
      "Disliked Foods": "Cheese-heavy dishes, fried food, very sweet desserts",
      "Preferred Cuisine": "Chinese, East Asian",
      "Preferred Beverages": "Green tea, warm water",
      "Portion Preference": "Medium"
    },
    "mealInstructions": [
      "Avoid high-sodium sauces and broths.",
      "Use herbs, ginger, garlic, and other seasonings for flavor.",
      "Offer steamed or baked dishes more frequently than fried dishes.",
      "Keep sodium within the resident's approved dietary target."
    ]
  },
  {
    "id": "R003",
    "name": "Eleanor Davis",
    "age": 89,
    "room": "106",
    "allergens": [],
    "diets": [
      "soft"
    ],
    "likes": [
      "Mashed potatoes",
      "scrambled eggs",
      "tender fish",
      "oatmeal",
      "soft cooked carrots"
    ],
    "notes": "Medical conditions: Arthritis, difficulty chewing\nNutritional priority: Maintain adequate food intake with easily chewed meals\nServe foods at the prescribed texture and piece size.\nAvoid hard, dry, and difficult-to-chew foods.\nProvide tender, moist protein options.\nEnsure meals are comfortable to eat.",
    "careProfile": {
      "Gender": "Female",
      "Mobility": "Uses a walker",
      "Eating Assistance": "Independent with meal setup",
      "Diet Type": "Soft and bite-sized foods",
      "Food Allergies": "None known",
      "Texture Requirement": "Soft and bite-sized, per approved care plan",
      "Swallowing Difficulties": "No diagnosed swallowing disorder",
      "Disliked Foods": "Tough meat, nuts, raw carrots, crunchy bread",
      "Preferred Cuisine": "Traditional American",
      "Preferred Beverages": "Warm milk, herbal tea",
      "Portion Preference": "Small to medium"
    },
    "mealInstructions": [
      "Serve foods at the prescribed texture and piece size.",
      "Avoid hard, dry, and difficult-to-chew foods.",
      "Provide tender, moist protein options.",
      "Ensure meals are comfortable to eat."
    ]
  },
  {
    "id": "R004",
    "name": "James Thompson",
    "age": 85,
    "room": "107",
    "allergens": [],
    "diets": [],
    "likes": [
      "Roasted chicken",
      "white rice",
      "green beans",
      "apples",
      "pasta"
    ],
    "notes": "Medical conditions: Chronic kidney disease\nNutritional priority: Follow clinician-defined sodium, potassium, phosphorus, protein, and fluid guidance as applicable\nCheck meals against James's approved renal nutrition plan.\nDo not assume that all potassium-rich or phosphorus-rich foods must be excluded.\nFollow individualized protein and fluid guidance.\nFlag dishes when required clinical limits are missing or cannot be verified.",
    "careProfile": {
      "Gender": "Male",
      "Mobility": "Uses a cane",
      "Eating Assistance": "Independent",
      "Diet Type": "Individualized renal diet",
      "Food Allergies": "Oranges, Mangoes",
      "Texture Requirement": "Regular",
      "Swallowing Difficulties": "None",
      "Disliked Foods": "Spicy dishes, heavily seasoned food, organ meats",
      "Preferred Cuisine": "American",
      "Preferred Beverages": "Water",
      "Portion Preference": "Medium"
    },
    "mealInstructions": [
      "Check meals against James's approved renal nutrition plan.",
      "Do not assume that all potassium-rich or phosphorus-rich foods must be excluded.",
      "Follow individualized protein and fluid guidance.",
      "Flag dishes when required clinical limits are missing or cannot be verified."
    ]
  },
  {
    "id": "R005",
    "name": "Maria Gonzalez",
    "age": 76,
    "room": "108",
    "allergens": [
      "dairy"
    ],
    "diets": [],
    "likes": [
      "Chicken tacos",
      "beans",
      "avocado",
      "rice",
      "grilled vegetables",
      "salsa"
    ],
    "notes": "Medical conditions: Lactose intolerance\nNutritional priority: Maintain adequate calcium and overall nutrition while minimizing lactose-related symptoms\nOffer lactose-free milk or suitable alternatives.\nAvoid regular dairy products that cause symptoms.\nUse lactose-free ingredients in creamy recipes when appropriate.\nInclude familiar Mexican-inspired flavors.",
    "careProfile": {
      "Gender": "Female",
      "Mobility": "Independent",
      "Eating Assistance": "Independent",
      "Diet Type": "Lactose-restricted",
      "Food Allergies": "None known",
      "Texture Requirement": "Regular",
      "Swallowing Difficulties": "None",
      "Disliked Foods": "Cream-based sauces, plain boiled vegetables",
      "Preferred Cuisine": "Mexican, Latin American",
      "Preferred Beverages": "Water, fruit-infused water",
      "Portion Preference": "Medium"
    },
    "mealInstructions": [
      "Offer lactose-free milk or suitable alternatives.",
      "Avoid regular dairy products that cause symptoms.",
      "Use lactose-free ingredients in creamy recipes when appropriate.",
      "Include familiar Mexican-inspired flavors."
    ]
  },
  {
    "id": "R006",
    "name": "Bill Parker",
    "age": 91,
    "room": "109",
    "allergens": [],
    "diets": [],
    "likes": [
      "Pancakes",
      "scrambled eggs",
      "mashed potatoes",
      "chicken soup",
      "pudding"
    ],
    "notes": "Medical conditions: Unintentional weight loss, reduced appetite\nNutritional priority: Support adequate calorie and protein intake\nOffer smaller, energy-dense portions.\nInclude protein-rich snacks between meals.\nOffer approved fortified foods and beverages when appropriate.\nMonitor acceptance of meals and report poor intake to staff.",
    "careProfile": {
      "Gender": "Male",
      "Mobility": "Uses a wheelchair",
      "Eating Assistance": "Needs meal setup and occasional assistance",
      "Diet Type": "Energy-dense, protein-rich diet",
      "Food Allergies": "None known",
      "Texture Requirement": "Regular",
      "Swallowing Difficulties": "None reported",
      "Disliked Foods": "Large salads, spicy food, dry meats",
      "Preferred Cuisine": "Traditional American",
      "Preferred Beverages": "Milk, smoothies",
      "Portion Preference": "Small, frequent meals"
    },
    "mealInstructions": [
      "Offer smaller, energy-dense portions.",
      "Include protein-rich snacks between meals.",
      "Offer approved fortified foods and beverages when appropriate.",
      "Monitor acceptance of meals and report poor intake to staff."
    ]
  },
  {
    "id": "R007",
    "name": "Susan Miller",
    "age": 80,
    "room": "110",
    "allergens": [
      "gluten"
    ],
    "diets": [],
    "likes": [
      "Quinoa",
      "roasted vegetables",
      "grilled chicken",
      "sweet potatoes",
      "fruit"
    ],
    "notes": "Medical conditions: Celiac disease\nNutritional priority: Maintain adequate nutrition while avoiding gluten exposure\nExclude wheat, barley, rye, and gluten-containing ingredients.\nVerify sauces, seasonings, and processed ingredients.\nPrevent gluten cross-contact during preparation and serving.\nUse certified gluten-free ingredients where needed.",
    "careProfile": {
      "Gender": "Female",
      "Mobility": "Independent",
      "Eating Assistance": "Independent",
      "Diet Type": "Strict gluten-free",
      "Food Allergies": "None known",
      "Texture Requirement": "Regular",
      "Swallowing Difficulties": "None",
      "Disliked Foods": "Fried food, overly salty dishes",
      "Preferred Cuisine": "Mediterranean, American",
      "Preferred Beverages": "Herbal tea, water",
      "Portion Preference": "Medium"
    },
    "mealInstructions": [
      "Exclude wheat, barley, rye, and gluten-containing ingredients.",
      "Verify sauces, seasonings, and processed ingredients.",
      "Prevent gluten cross-contact during preparation and serving.",
      "Use certified gluten-free ingredients where needed."
    ]
  },
  {
    "id": "R008",
    "name": "David Kim",
    "age": 83,
    "room": "111",
    "allergens": [],
    "diets": [],
    "likes": [
      "Rice",
      "tofu",
      "steamed eggs",
      "Korean-style soups",
      "grilled fish"
    ],
    "notes": "Medical conditions: Mild cognitive impairment\nNutritional priority: Encourage consistent meal intake and hydration\nProvide familiar foods and predictable meal routines.\nAvoid overly complicated meal presentations.\nOffer gentle reminders and encouragement during meals.\nMonitor meal completion and hydration.",
    "careProfile": {
      "Gender": "Male",
      "Mobility": "Walks with supervision",
      "Eating Assistance": "Requires occasional verbal prompting",
      "Diet Type": "Regular",
      "Food Allergies": "None known",
      "Texture Requirement": "Regular",
      "Swallowing Difficulties": "None reported",
      "Disliked Foods": "Heavy cream sauces, very sweet foods",
      "Preferred Cuisine": "Korean, East Asian",
      "Preferred Beverages": "Warm barley tea, water",
      "Portion Preference": "Medium"
    },
    "mealInstructions": [
      "Provide familiar foods and predictable meal routines.",
      "Avoid overly complicated meal presentations.",
      "Offer gentle reminders and encouragement during meals.",
      "Monitor meal completion and hydration."
    ]
  },
  {
    "id": "R009",
    "name": "Patricia Johnson",
    "age": 87,
    "room": "112",
    "allergens": [],
    "diets": [
      "low-sodium"
    ],
    "likes": [
      "Grilled salmon",
      "vegetables",
      "oatmeal",
      "berries",
      "lentil soup"
    ],
    "notes": "Medical conditions: Cardiovascular disease, high cholesterol\nNutritional priority: Support cardiovascular health through balanced meals lower in saturated fat and sodium\nPrioritize vegetables, whole grains, and appropriate lean proteins.\nFavor unsaturated fats over saturated fats.\nLimit high-sodium processed foods.\nOffer baked, grilled, or steamed options.",
    "careProfile": {
      "Gender": "Female",
      "Mobility": "Uses a walker",
      "Eating Assistance": "Independent",
      "Diet Type": "Heart-healthy",
      "Food Allergies": "None known",
      "Texture Requirement": "Regular",
      "Swallowing Difficulties": "None",
      "Disliked Foods": "Fried chicken, bacon, creamy pasta",
      "Preferred Cuisine": "Mediterranean, American",
      "Preferred Beverages": "Water, unsweetened tea",
      "Portion Preference": "Small to medium"
    },
    "mealInstructions": [
      "Prioritize vegetables, whole grains, and appropriate lean proteins.",
      "Favor unsaturated fats over saturated fats.",
      "Limit high-sodium processed foods.",
      "Offer baked, grilled, or steamed options."
    ]
  },
  {
    "id": "R010",
    "name": "George Anderson",
    "age": 79,
    "room": "113",
    "allergens": [
      "nuts"
    ],
    "diets": [],
    "likes": [
      "Chicken",
      "pasta",
      "potatoes",
      "beef stew",
      "roasted vegetables"
    ],
    "notes": "Medical conditions: None requiring a therapeutic diet\nNutritional priority: Maintain balanced nutrition while strictly avoiding peanut exposure\nStrictly avoid peanuts and peanut-containing ingredients.\nCheck packaged foods, sauces, dressings, and desserts for allergens.\nFollow facility allergen cross-contact protocols.\nFlag any menu item with unknown peanut safety status.",
    "careProfile": {
      "Gender": "Male",
      "Mobility": "Independent",
      "Eating Assistance": "Independent",
      "Diet Type": "Regular, peanut-free",
      "Food Allergies": "Peanuts",
      "Texture Requirement": "Regular",
      "Swallowing Difficulties": "None",
      "Disliked Foods": "Spicy dishes, tofu",
      "Preferred Cuisine": "American, Italian",
      "Preferred Beverages": "Water, lemonade",
      "Portion Preference": "Large"
    },
    "mealInstructions": [
      "Strictly avoid peanuts and peanut-containing ingredients.",
      "Check packaged foods, sauces, dressings, and desserts for allergens.",
      "Follow facility allergen cross-contact protocols.",
      "Flag any menu item with unknown peanut safety status."
    ]
  },
  {
    "id": "R011",
    "name": "Linda Martinez",
    "age": 84,
    "room": "114",
    "allergens": [],
    "diets": [
      "vegetarian"
    ],
    "likes": [
      "Lentils",
      "tofu",
      "vegetable soup",
      "eggs",
      "cheese",
      "bean burritos"
    ],
    "notes": "Medical conditions: None requiring a therapeutic diet\nNutritional priority: Maintain adequate protein, vitamin B12, iron, and overall nutrition\nDo not include meat, poultry, fish, or meat-based broths.\nEggs and dairy products are acceptable.\nProvide varied vegetarian protein sources.\nAvoid offering only side dishes as vegetarian meals.",
    "careProfile": {
      "Gender": "Female",
      "Mobility": "Uses a cane",
      "Eating Assistance": "Independent",
      "Diet Type": "Lacto-ovo vegetarian",
      "Food Allergies": "None known",
      "Texture Requirement": "Regular",
      "Swallowing Difficulties": "None",
      "Disliked Foods": "Meat, fish, very spicy dishes",
      "Preferred Cuisine": "Mediterranean, Mexican, Vegetarian",
      "Preferred Beverages": "Tea, water",
      "Portion Preference": "Medium"
    },
    "mealInstructions": [
      "Do not include meat, poultry, fish, or meat-based broths.",
      "Eggs and dairy products are acceptable.",
      "Provide varied vegetarian protein sources.",
      "Avoid offering only side dishes as vegetarian meals."
    ]
  },
  {
    "id": "R012",
    "name": "Thomas Brown",
    "age": 92,
    "room": "115",
    "allergens": [],
    "diets": [
      "pureed"
    ],
    "likes": [
      "Chicken dishes",
      "mashed vegetables",
      "fruit purees",
      "smooth desserts"
    ],
    "notes": "Medical conditions: Dysphagia\nNutritional priority: Support adequate nutrition and hydration while following the prescribed swallowing care plan\nProvide foods that meet the prescribed IDDSI texture level.\nAll liquids must meet the prescribed consistency.\nAvoid mixed textures, lumps, and unsuitable garnishes.\nRequire trained staff verification of texture and liquid consistency before serving.\nFollow the individualized positioning, pacing, and supervision plan.",
    "careProfile": {
      "Gender": "Male",
      "Mobility": "Wheelchair user",
      "Eating Assistance": "Requires staff assistance and supervision",
      "Diet Type": "Texture-modified diet",
      "Food Allergies": "None known",
      "Texture Requirement": "IDDSI Level 4 — Pureed",
      "Liquid Consistency": "IDDSI Level 2 — Mildly Thick, per fictional care plan",
      "Disliked Foods": "Bitter vegetables, heavily spiced dishes",
      "Preferred Cuisine": "Traditional American",
      "Preferred Beverages": "Thickened apple juice, thickened water as prescribed",
      "Portion Preference": "Small"
    },
    "mealInstructions": [
      "Provide foods that meet the prescribed IDDSI texture level.",
      "All liquids must meet the prescribed consistency.",
      "Avoid mixed textures, lumps, and unsuitable garnishes.",
      "Require trained staff verification of texture and liquid consistency before serving.",
      "Follow the individualized positioning, pacing, and supervision plan."
    ]
  },
  {
    "id": "R013",
    "name": "Helen Wong",
    "age": 81,
    "room": "116",
    "allergens": [
      "shellfish"
    ],
    "diets": [
      "diabetic",
      "low-sodium"
    ],
    "likes": [
      "Congee",
      "steamed vegetables",
      "tofu",
      "fish",
      "brown rice"
    ],
    "notes": "Medical conditions: Type 2 diabetes, hypertension\nNutritional priority: Support consistent carbohydrate intake while keeping sodium within prescribed limits\nBalance carbohydrate portions across meals.\nUse lower-sodium sauces and broths.\nAccount for rice and congee portions when planning carbohydrates.\nCheck meals against both dietary requirements rather than treating them independently.",
    "careProfile": {
      "Gender": "Female",
      "Mobility": "Independent",
      "Eating Assistance": "Independent",
      "Diet Type": "Consistent carbohydrate, low sodium",
      "Food Allergies": "Shrimp",
      "Texture Requirement": "Regular",
      "Swallowing Difficulties": "None",
      "Disliked Foods": "Fried food, heavy desserts, overly salty dishes",
      "Preferred Cuisine": "Chinese",
      "Preferred Beverages": "Warm water, unsweetened tea",
      "Portion Preference": "Small to medium"
    },
    "mealInstructions": [
      "Balance carbohydrate portions across meals.",
      "Use lower-sodium sauces and broths.",
      "Account for rice and congee portions when planning carbohydrates.",
      "Check meals against both dietary requirements rather than treating them independently."
    ]
  },
  {
    "id": "R014",
    "name": "Richard Evans",
    "age": 86,
    "room": "117",
    "allergens": [],
    "diets": [],
    "likes": [
      "Yogurt",
      "soup",
      "sandwiches",
      "scrambled eggs",
      "bananas"
    ],
    "notes": "Medical conditions: Reduced appetite\nNutritional priority: Encourage adequate daily calorie and protein intake\nOffer smaller portions more frequently.\nInclude appealing snacks between meals.\nPrioritize nutrient-dense foods.\nAvoid overwhelming the resident with large plates.\nRecord consistently low meal intake for staff follow-up.",
    "careProfile": {
      "Gender": "Male",
      "Mobility": "Uses a walker",
      "Eating Assistance": "Independent with occasional encouragement",
      "Diet Type": "Regular, small frequent meals",
      "Food Allergies": "None known",
      "Texture Requirement": "Regular",
      "Swallowing Difficulties": "None",
      "Disliked Foods": "Large meals, very spicy food, dry chicken",
      "Preferred Cuisine": "American, British",
      "Preferred Beverages": "Tea, milk",
      "Portion Preference": "Small"
    },
    "mealInstructions": [
      "Offer smaller portions more frequently.",
      "Include appealing snacks between meals.",
      "Prioritize nutrient-dense foods.",
      "Avoid overwhelming the resident with large plates.",
      "Record consistently low meal intake for staff follow-up."
    ]
  },
  {
    "id": "R015",
    "name": "Fatima Hassan",
    "age": 77,
    "room": "118",
    "allergens": [],
    "diets": [],
    "likes": [
      "Lentil soup",
      "chicken",
      "couscous",
      "chickpeas",
      "grilled vegetables"
    ],
    "notes": "Medical conditions: None requiring a therapeutic diet\nNutritional priority: Maintain balanced nutrition while respecting religious dietary requirements\nProvide halal-certified meat when serving meat dishes.\nExclude pork, pork-derived ingredients, and alcohol-containing ingredients.\nVerify ingredient sourcing and preparation practices.\nOffer vegetarian alternatives when halal meat is unavailable.\nRespect individual preferences regarding food preparation.",
    "careProfile": {
      "Gender": "Female",
      "Mobility": "Independent",
      "Eating Assistance": "Independent",
      "Diet Type": "Halal",
      "Food Allergies": "None known",
      "Texture Requirement": "Regular",
      "Swallowing Difficulties": "None",
      "Disliked Foods": "Pork, overly sweet dishes, heavy cream sauces",
      "Preferred Cuisine": "Middle Eastern, Mediterranean",
      "Preferred Beverages": "Mint tea, water",
      "Portion Preference": "Medium"
    },
    "mealInstructions": [
      "Provide halal-certified meat when serving meat dishes.",
      "Exclude pork, pork-derived ingredients, and alcohol-containing ingredients.",
      "Verify ingredient sourcing and preparation practices.",
      "Offer vegetarian alternatives when halal meat is unavailable.",
      "Respect individual preferences regarding food preparation."
    ]
  }
];

export function initialState(): KitchenState {
  return {
    additionalResidentsVersion: 1,
    residentProfileVersion: RESIDENT_PROFILE_VERSION,
    plan: { breakfast: "b-pancakes", lunch: "l-alfredo", dinner: "d-salmon" },
    overrides: { breakfast: {}, lunch: {}, dinner: {} },
    residents: [...RESIDENTS, ...ADDITIONAL_RESIDENTS].map((r) => ({ ...r, likes: [...r.likes], allergens: [...r.allergens], diets: [...r.diets], ...(r.careProfile ? { careProfile: { ...r.careProfile } } : {}), ...(r.mealInstructions ? { mealInstructions: [...r.mealInstructions] } : {}) })),
    ingredients: INGREDIENTS.map((i) => ({ ...i })),
    history: [],
  };
}

export const dishById = (id: string) => DISHES.find((d) => d.id === id)!;
