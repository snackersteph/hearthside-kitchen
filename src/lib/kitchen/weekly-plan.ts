import { ChefHat, HeartPulse, Package, type LucideIcon } from "lucide-react";
import type { AgentRole } from "./agent-workflow";

// Static presentation metadata for the Agent Workspace. All weekly activity, counts and
// handoffs come from the persisted workflow runs and events in agent-workflow.ts.

export type AgentId = AgentRole;
export type { AgentActivity } from "./agent-workflow";

export const TOTAL_MEALS = 21;

export const AGENT_INFO: Record<AgentId, { name: string; icon: LucideIcon; responsibilities: string[] }> = {
  dietary: {
    name: "Dietary Agent",
    icon: HeartPulse,
    responsibilities: [
      "Review resident dietary profiles",
      "Identify allergies and dietary restrictions",
      "Communicate meal planning constraints",
      "Validate proposed meal assignments",
      "Recheck substitutions",
    ],
  },
  menu: {
    name: "Menu Agent",
    icon: ChefHat,
    responsibilities: [
      "Generate the 21 primary meals",
      "Plan breakfast, lunch, and dinner",
      "Consider resident preferences",
      "Choose recipes from an approved catalog",
      "Respond to dietary and inventory feedback",
      "Propose substitutions",
    ],
  },
  inventory: {
    name: "Inventory Agent",
    icon: Package,
    responsibilities: [
      "Calculate ingredient requirements for the entire week",
      "Check available kitchen stock",
      "Identify shortages",
      "Suggest purchasing needs",
      "Request recipe adjustments",
    ],
  },
};

export const AGENT_ORDER: AgentId[] = ["dietary", "menu", "inventory"];

export const STAGE_INFO: { id: 1 | 2 | 3 | 4 | 5; title: string; agents: string }[] = [
  { id: 1, title: "Dietary Requirements Shared", agents: "Dietary Agent → Menu Agent" },
  { id: 2, title: "Weekly Menu Generated", agents: "Menu Agent → Inventory Agent" },
  { id: 3, title: "Ingredient Requirements Checked", agents: "Inventory Agent → Menu Agent" },
  { id: 4, title: "Conflicts Resolved", agents: "Menu Agent → Dietary Agent → Inventory Agent" },
  { id: 5, title: "Manager Review", agents: "AI Team → Kitchen Manager" },
];

export const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const MEAL_ROWS = ["Breakfast", "Lunch", "Dinner"] as const;
