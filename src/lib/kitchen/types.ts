export type Meal = "breakfast" | "lunch" | "dinner";
export const MEALS: Meal[] = ["breakfast", "lunch", "dinner"];
export type Allergen = "dairy" | "gluten" | "nuts" | "shellfish" | "fish" | "egg" | "soy";
export const ALLERGENS: Allergen[] = ["dairy", "gluten", "nuts", "shellfish", "fish", "egg", "soy"];
export type Diet = "vegetarian" | "low-sodium" | "diabetic" | "soft" | "pureed";
export const DIETS: Diet[] = ["vegetarian", "low-sodium", "diabetic", "soft", "pureed"];
export type DishTag = "vegetarian" | "high-sodium" | "high-sugar" | "soft" | "pureed";
export type AgentId = "dietary" | "menu" | "inventory";

export interface Resident {
  id: string;
  dietaryRevision?: number;
  name: string;
  photoUrl?: string | undefined;
  room: string;
  age: number;
  allergens: Allergen[];
  diets: Diet[];
  likes: string[];
  notes: string;
  careProfile?: Record<string, string>;
  mealInstructions?: string[];
}

export interface Ingredient {
  category?: import("./inventory-catalog").FoodCategory;
  photoUrl?: string | undefined;
  id: string;
  name: string;
  unit: string;
  stock: number;
  onOrder: number;
  vendor: string;
  packSize: number;
  unitCost: number;
}

export interface Dish {
  id: string;
  name: string;
  meal: Meal;
  description: string;
  allergens: Allergen[];
  tags: DishTag[];
  /** qty is per serving; unit "g"/"ml" converts to the ingredient's kg/L stock unit. */
  ingredients: { id: string; qty: number; unit?: "g" | "ml" }[];
}

export interface Decision {
  proposalId: string;
  kind: "substitution" | "purchase";
  status: "approved" | "rejected";
  at: number;
  summary: string;
  modified: boolean;
  serviceDate?: string;
  note?: string;
}

/** A staff-visible record that a resident's care information was changed. */
export interface ProfileUpdate {
  id: string;
  residentId: string;
  at: number;
  summary: string;
  review: "open" | "seen";
}

/** A reaction observed after a resident ate a specific meal. */
export interface Observation {
  id: string;
  residentId: string;
  serviceDate: string;
  meal: Meal;
  dishId: string;
  reaction: string;
  severity: "note" | "concern";
  status: "open" | "reviewed";
  notedAt: number;
}

export interface KitchenState {
  recipes?: import("./recipes").Recipe[];
  deletedRecipeIds?: string[];
  deletedIngredientIds?: string[];
  additionalResidentsVersion?: number;
  alternativePreferences?: { residentId: string; meal: Meal; fromDishId: string; dishId: string; dietarySignature?: string }[];
  seeded?: boolean;
  residentProfileVersion?: number;
  purchaseHorizonDays?: 7 | 14;
  leadTimeDays?: number;
  orders?: PurchaseOrder[];
  profileUpdates?: ProfileUpdate[];
  observations?: Observation[];
  plan: Record<Meal, string>;
  scheduledPlans?: Record<string, Partial<Record<Meal, string>>>;
  scheduledOverrides?: Record<string, Partial<Record<Meal, Record<string, string>>>>;
  mealApprovals?: Record<string, Partial<Record<Meal, { signature: string; approvedAt: number }>>>;
  mealRejections?: Record<string, Partial<Record<Meal, { signature: string; rejectedAt: number }>>>;
  overrides: Record<Meal, Record<string, string>>;
  residents: Resident[];
  ingredients: Ingredient[];
  history: Decision[];
}

export interface SubstitutionProposal {
  approved?: boolean;
  id: string;
  kind: "substitution";
  agent: "menu";
  meal: Meal;
  fromDishId: string;
  serviceDate?: string;
  approvalDueDate?: string;
  dishId: string;
  residentIds: string[];
  reasons: Record<string, string[]>;
}

export interface PurchaseLine {
  ingredientId: string;
  shortage: number;
  qty: number;
}

export interface PurchaseProposal {
  horizonDays?: 7 | 14;
  deliveryDate?: string;
  neededDate?: string;
  orderByDate?: string;
  id: string;
  kind: "purchase";
  agent: "inventory";
  vendor: string;
  lines: PurchaseLine[];
  total: number;
}

export type Proposal = SubstitutionProposal | PurchaseProposal;

export interface PurchaseOrder {
  id: string;
  vendor: string;
  lines: PurchaseLine[];
  deliveryDate: string;
  status: "incoming" | "received";
  receivedAt?: number;
}

export interface Conflict {
  meal: Meal;
  residentId: string;
  dishId: string;
  reasons: string[];
  status: "proposal-pending" | "needs-staff";
}

export interface AgentMessage {
  id: string;
  agent: AgentId;
  to?: AgentId | "staff";
  meal?: Meal;
  text: string;
  tone: "info" | "alert" | "ok";
}
