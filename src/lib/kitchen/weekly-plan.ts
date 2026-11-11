import { ChefHat, HeartPulse, Package, type LucideIcon } from "lucide-react";

// Simulated weekly planning scenario for the Agent Workspace prototype.
// All events are mock data; structure mirrors what real agent events would provide.

export type AgentId = "dietary" | "menu" | "inventory";
export type AgentActivity = "idle" | "working" | "waiting-agent" | "waiting-manager" | "completed" | "blocked";
export type WeeklyStatus = "not-started" | "generating" | "needs-review" | "approved";
export type CellStatus = "unplanned" | "passed" | "review" | "approved";
export type HandoffStatus = "completed" | "warning" | "pending";
export type SubstitutionId = "wed" | "fri";

export const SCENARIO_WEEK_LABEL = "November 16–22, 2026";
/** Monday of the scenario week; weekOffset counts whole weeks from here. */
export const SCENARIO_WEEK_START = "2026-11-16";
export const TOTAL_MEALS = 21;
export const TOTAL_RESIDENTS = 12;
export const GEN_STEPS = 9;

export const AGENT_INFO: Record<AgentId, {
  name: string;
  icon: LucideIcon;
  responsibilities: string[];
  statusTitle: string;
  statusDetail: string;
}> = {
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
    statusTitle: "Completed — Weekly dietary review",
    statusDetail: "Reviewed 12 residents and shared dietary constraints for all 21 meal slots.",
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
    statusTitle: "Waiting for Approval",
    statusDetail: "Created 21 meals and proposed 2 changes based on agent feedback.",
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
    statusTitle: "Completed — Inventory analysis",
    statusDetail: "Checked weekly ingredient requirements and identified 2 shortages.",
  },
};

export const AGENT_ORDER: AgentId[] = ["dietary", "menu", "inventory"];

export interface Handoff {
  id: string;
  stage: number;
  from: string;
  to: string;
  time: string;
  status: HandoffStatus;
  summary: string;
  reason: string;
  shared: string[];
  response: string;
  impact: string;
  affectedMeal?: { date: string; meal: "lunch"; label: string };
}

export const HANDOFFS: Handoff[] = [
  {
    id: "h1", stage: 1, from: "Dietary Agent", to: "Menu Agent", time: "6:02 AM", status: "completed",
    summary: "Weekly dietary requirements ready. Account for 2 residents requiring dairy-free meals and 1 resident with a documented soft-texture requirement.",
    reason: "The Menu Agent cannot assign meals safely without knowing each resident's documented dietary restrictions.",
    shared: ["12 resident dietary profiles reviewed", "2 residents require dairy-free meals", "1 resident requires a soft-texture diet", "Constraints mapped to all 21 meal slots"],
    response: "Menu Agent acknowledged the requirements and incorporated the constraints into the weekly planning process.",
    impact: "All 21 meal slots are now planned against the documented dietary constraints.",
  },
  {
    id: "h2", stage: 2, from: "Menu Agent", to: "Inventory Agent", time: "6:05 AM", status: "completed",
    summary: "Weekly menu drafted. Please verify ingredient availability for the proposed 21 meals and their resident-specific alternatives.",
    reason: "Every proposed meal must be checked against recorded kitchen stock before the plan can be finalized.",
    shared: ["21 primary meals selected from the approved catalog", "Resident-specific alternatives for restricted diets", "Aggregated ingredient requirement list"],
    response: "Inventory Agent began the weekly stock evaluation.",
    impact: "Ingredient requirements for the full week are queued for stock verification.",
  },
  {
    id: "h3", stage: 3, from: "Inventory Agent", to: "Menu Agent", time: "6:07 AM", status: "warning",
    summary: "Wednesday lunch requires 10 portions of chicken, but only 6 portions are available. Please propose an alternative.",
    reason: "Recorded chicken stock cannot cover the planned Wednesday lunch for all residents.",
    shared: ["Wednesday lunch: 10 chicken portions required", "6 portions available in recorded stock", "Shortage of 4 portions"],
    response: "Menu Agent began evaluating recipes using ingredients available in inventory.",
    impact: "Wednesday lunch is flagged for substitution.",
    affectedMeal: { date: "2026-11-18", meal: "lunch", label: "Wednesday Lunch" },
  },
  {
    id: "h4", stage: 3, from: "Inventory Agent", to: "Menu Agent", time: "6:08 AM", status: "warning",
    summary: "Friday lunch requires 8 portions of cod, but only 3 portions are available. Please propose an alternative.",
    reason: "Recorded cod stock cannot cover the planned Friday lunch for all residents.",
    shared: ["Friday lunch: 8 cod portions required", "3 portions available in recorded stock", "Shortage of 5 portions"],
    response: "Menu Agent began evaluating recipes using ingredients available in inventory.",
    impact: "Friday lunch is flagged for substitution.",
    affectedMeal: { date: "2026-11-20", meal: "lunch", label: "Friday Lunch" },
  },
  {
    id: "h5", stage: 4, from: "Menu Agent", to: "Dietary Agent", time: "6:10 AM", status: "completed",
    summary: "Proposed replacing Wednesday's chicken lunch with a lentil-based recipe and Friday's cod lunch with a vegetable pasta. Please verify compatibility with documented resident requirements.",
    reason: "Both shortages require substitute recipes, and each substitution must be rechecked against resident dietary restrictions.",
    shared: ["Wednesday lunch: Lentil and Vegetable Bowl", "Friday lunch: Creamy Vegetable Pasta", "Full ingredient lists for both recipes"],
    response: "Dietary Agent rechecked the revised assignments against all 12 resident profiles.",
    impact: "Both substitutions entered dietary validation.",
  },
  {
    id: "h6", stage: 4, from: "Dietary Agent", to: "Inventory Agent", time: "6:12 AM", status: "completed",
    summary: "Known dietary checks passed for the updated assignments. Please confirm stock for the revised recipes.",
    reason: "Dietary validation passed; the revised recipes still need confirmed ingredient availability.",
    shared: ["Dietary validation results for both substitutions", "No conflicts with dairy-free or soft-texture requirements"],
    response: "Sufficient recorded ingredients are available for the revised recipes.",
    impact: "Wednesday's and Friday's lunch revisions are ready for human review.",
  },
  {
    id: "h7", stage: 5, from: "AI Team", to: "Kitchen Manager", time: "Now", status: "pending",
    summary: "Your weekly meal plan is ready for review. 21 meals have been planned, with 2 proposed substitutions requiring approval.",
    reason: "Automated checks are complete; proposed substitutions require a manager decision before the week can be approved.",
    shared: ["21 planned meals with resident alternatives", "2 proposed substitutions", "Dietary and inventory validation results"],
    response: "Awaiting manager review.",
    impact: "The weekly plan cannot be approved until the 2 pending decisions are resolved.",
  },
];

export interface Stage {
  id: number;
  title: string;
  agents: string;
  bullets: string[];
  handoffIds: string[];
  outcome: string;
  statusLabel: string;
  status: HandoffStatus;
}

export const STAGES: Stage[] = [
  {
    id: 1, title: "Analyze Weekly Requirements", agents: "Dietary Agent → Menu Agent",
    bullets: [
      "Dietary Agent reviewed 12 resident profiles.",
      "Identified restrictions affecting meal assignments.",
      "Shared structured dietary constraints with Menu Agent.",
      "Menu Agent acknowledged the requirements.",
    ],
    handoffIds: ["h1"],
    outcome: "Menu Agent incorporated the constraints into the weekly planning process.",
    statusLabel: "Completed", status: "completed",
  },
  {
    id: 2, title: "Generate Weekly Menu", agents: "Menu Agent → Inventory Agent",
    bullets: [
      "Menu Agent selected 21 meals.",
      "Created breakfast, lunch, and dinner plans for all seven days.",
      "Created resident-specific alternatives where appropriate.",
      "Sent ingredient requirements to Inventory Agent.",
    ],
    handoffIds: ["h2"],
    outcome: "Inventory Agent began the weekly stock evaluation.",
    statusLabel: "Completed", status: "completed",
  },
  {
    id: 3, title: "Check Inventory and Identify Conflicts", agents: "Inventory Agent → Menu Agent",
    bullets: [
      "Inventory Agent calculated aggregate weekly ingredient demand.",
      "Compared ingredient demand with available stock.",
      "Identified 2 shortages.",
      "Requested substitutions or purchasing decisions.",
    ],
    handoffIds: ["h3", "h4"],
    outcome: "Menu Agent began evaluating recipes using ingredients available in inventory.",
    statusLabel: "Warning — Requires Resolution", status: "warning",
  },
  {
    id: 4, title: "Revise and Validate Weekly Plan", agents: "Menu Agent → Dietary Agent → Inventory Agent",
    bullets: [
      "Menu Agent proposed alternative meals.",
      "Dietary Agent checked the revised meal assignments.",
      "Inventory Agent verified ingredient availability.",
      "The agents returned the updated results.",
    ],
    handoffIds: ["h5", "h6"],
    outcome: "Both lunch revisions are ready for human review.",
    statusLabel: "Completed — Awaiting Approval", status: "completed",
  },
  {
    id: 5, title: "Human Review and Approval", agents: "AI Team → Kitchen Manager",
    bullets: [
      "All weekly planning tasks are complete.",
      "Proposed changes are summarized.",
      "Dietary and inventory validation results are displayed.",
      "Remaining issues are clearly identified.",
      "Kitchen manager approval is requested.",
    ],
    handoffIds: ["h7"],
    outcome: "Waiting for the kitchen manager's decisions.",
    statusLabel: "Needs Review", status: "pending",
  },
];

// Generation step at which each stage becomes visible.
export const STAGE_REVEAL_STEP = [2, 4, 6, 8, 9];

export interface Substitution {
  id: SubstitutionId;
  date: string;
  mealLabel: string;
  original: string;
  proposals: string[];
  reason: string;
}

export const SUBSTITUTIONS: Substitution[] = [
  {
    id: "wed", date: "2026-11-18", mealLabel: "Wednesday Lunch",
    original: "Chicken with Rice and Vegetables",
    proposals: ["Lentil and Vegetable Bowl", "Chickpea and Spinach Curry"],
    reason: "Insufficient chicken inventory (6 of 10 portions available).",
  },
  {
    id: "fri", date: "2026-11-20", mealLabel: "Friday Lunch",
    original: "Baked Cod with Herb Potatoes",
    proposals: ["Creamy Vegetable Pasta", "Mushroom Risotto"],
    reason: "Insufficient cod inventory (3 of 8 portions available).",
  },
];

export const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const MEAL_ROWS = ["Breakfast", "Lunch", "Dinner"] as const;

// Fictional recipe names per slot: [mealRow][dayIndex].
export const MEAL_NAMES: string[][] = [
  ["Oatmeal with Berries", "Scrambled Eggs on Toast", "Banana Pancakes", "Yogurt and Granola", "Vegetable Omelette", "French Toast", "Rice Congee"],
  ["Chicken and Rice", "Baked Salmon with Greens", "Chicken with Rice and Vegetables", "Beef and Barley Stew", "Baked Cod with Herb Potatoes", "Turkey Sandwich Plate", "Vegetable Curry with Rice"],
  ["Pasta Bolognese", "Roast Chicken with Potatoes", "Lentil Soup with Bread", "Grilled Fish with Beans", "Beef Stir-fry", "Homemade Pizza", "Roast Vegetable Bake"],
];

export interface DecisionState {
  proposalIndex: number;
  state: "pending" | "revalidating" | "approved";
}

export interface WorkspaceState {
  weekOffset: number;
  status: WeeklyStatus;
  genStep: number;
  decisions: Record<SubstitutionId, DecisionState>;
}

export const INITIAL_WORKSPACE: WorkspaceState = {
  weekOffset: 0,
  status: "not-started",
  genStep: 0,
  decisions: {
    wed: { proposalIndex: 0, state: "pending" },
    fri: { proposalIndex: 0, state: "pending" },
  },
};

export function weekRangeLabel(offset: number): string {
  if (offset === 0) return SCENARIO_WEEK_LABEL;
  const start = new Date(2026, 10, 16 + offset * 7);
  const end = new Date(2026, 10, 22 + offset * 7);
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString("en-US", { month: "long", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
  return `${fmt(start, start.getMonth() !== end.getMonth() && start.getFullYear() !== end.getFullYear())}–${fmt(end, true)}`;
}

export function agentActivity(step: number, status: WeeklyStatus): Record<AgentId, AgentActivity> {
  if (status === "approved") return { dietary: "completed", menu: "completed", inventory: "completed" };
  if (status === "not-started") return { dietary: "idle", menu: "idle", inventory: "idle" };
  if (status === "needs-review") return { dietary: "completed", menu: "waiting-manager", inventory: "completed" };
  // generating
  if (step <= 1) return { dietary: "working", menu: "idle", inventory: "idle" };
  if (step <= 3) return { dietary: "completed", menu: "working", inventory: "idle" };
  if (step <= 5) return { dietary: "completed", menu: "waiting-agent", inventory: "working" };
  if (step <= 7) return { dietary: "completed", menu: "working", inventory: "completed" };
  return { dietary: "working", menu: "waiting-agent", inventory: "working" };
}

export function cellStatus(
  ws: WorkspaceState,
  dayIndex: number,
  mealRow: number,
): CellStatus {
  if (ws.status === "not-started" || ws.weekOffset !== 0) return "unplanned";
  if (ws.status === "approved") return "approved";
  const isWedLunch = dayIndex === 2 && mealRow === 1;
  const isFriLunch = dayIndex === 4 && mealRow === 1;
  if (isWedLunch) return ws.decisions.wed.state === "approved" ? "passed" : "review";
  if (isFriLunch) return ws.decisions.fri.state === "approved" ? "passed" : "review";
  return "passed";
}

export function summaryCounts(ws: WorkspaceState) {
  const planned = ws.status === "not-started" || ws.weekOffset !== 0 ? 0 : TOTAL_MEALS;
  const resolved = (ws.decisions.wed.state === "approved" ? 1 : 0) + (ws.decisions.fri.state === "approved" ? 1 : 0);
  const issues = planned === 0 ? 0 : 2;
  const pending = planned === 0 || ws.status === "approved" ? 0 : 2 - resolved;
  return { planned, residents: planned === 0 ? 0 : TOTAL_RESIDENTS, issues, resolved, pending };
}
