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
  name: string;
  room: string;
  age: number;
  allergens: Allergen[];
  diets: Diet[];
  likes: string[];
  notes: string;
}

export interface Ingredient {
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
  ingredients: { id: string; qty: number }[];
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

export interface KitchenState {
  purchaseHorizonDays?: 7 | 14;
  leadTimeDays?: number;
  orders?: PurchaseOrder[];
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
