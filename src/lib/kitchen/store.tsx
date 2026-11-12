import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Context, type ReactNode } from "react";
import { initialState, dishById, currentDishId, INGREDIENTS, RESIDENT_PROFILE_VERSION, RESIDENTS, restoreKitchenCatalog } from "./data";
import { analyze, analyzeMenuDay, conflictReasons, dietarySignature, mealSignature, resolveMenuState, type Analysis } from "./engine";
import type { AgentId, Ingredient, KitchenState, Meal, Observation, ProfileUpdate, PurchaseLine, Resident } from "./types";
import { canApproveMeal, dateKey, dayAt, scheduledState } from "./schedule";
import { loadKitchenCatalogs, withKitchenCatalogs } from "./catalog-storage";
import { isValidRecipe, recipeLibrary, type Recipe } from "./recipes";
import { ADDITIONAL_INGREDIENTS, FOOD_CATEGORIES } from "./inventory-catalog";
import { profileContentChanges } from "./profile-changes";
import { stockOrderSchema, stockVendors, stockOrderEstimate } from "./stock-orders";
import { migrateDemoContent } from "./demo-content";
import { migrateMealHistory } from "./meal-history-demo";
import { migrateMenuReset } from "./menu-reset";
import { applyWeeklyStatus, createWeeklyPlan, isDateKey, migrateWeeklyPlans, sortWeeklyPlans, weeklyPlanId, weekStartFor, type WeeklyMenuStatus, type WeeklyPurchasingStatus } from "./weekly-schedule";
import { generateWeeklyMenu, regenerateWeeklyMeal, reviseWeeklyMenu, weeklyMenu, type WeeklyMenu } from "./weekly-menu";
import {
  advanceWeeklyWorkflow, approveWeeklyMenu, decideRevision, flagApprovedWeekChanges, migrateAgentWorkflow, requestAnotherRevision,
  startWeeklyWorkflow, weeklyApprovalChecks,
} from "./agent-workflow";
import { activeWeeklyPurchasing, openWeeklyPurchasing, settleWeeklyPurchasing, type WeeklyPurchasePlan } from "./weekly-purchasing";
import { migrateApprovalCleanup } from "./approval-cleanup";
import { migrateInventoryReplenishment } from "./inventory-replenishment";
import { rebuild, replayAt } from "./shared-sync";
import { supabase } from "@/integrations/supabase/client";
import { approveEmergencyMenuDemo } from "./emergency-menu-demo";

type Action =
  | { type: "approveEmergencyMenuDemo"; id: string }
  | { type: "addResident"; resident: Resident }
  | { type: "deleteResident"; id: string }
  | { type: "addIngredient"; ingredient: Ingredient }
  | { type: "updateIngredient"; ingredient: Ingredient }
  | { type: "deleteIngredient"; id: string }
  | { type: "addRecipe"; recipe: Recipe }
  | { type: "deleteRecipe"; id: string }
  | { type: "editRecipe"; recipe: Recipe }
  | { type: "approveMeal"; date: string; meal: Meal }
  | { type: "rejectMeal"; date: string; meal: Meal }
  | { type: "setMealPlan"; date: string; meal: Meal; dishId: string; overrides: Record<string, string> }
  | { type: "setHorizon"; days: 7 | 14 }
  | { type: "setLeadTime"; days: number }
  | { type: "editAgentProfile"; agent: AgentId; summary?: string; duties?: string[]; config?: Record<string, string> }
  | { type: "receiveOrder"; id: string }
  | { type: "deleteOrder"; id: string }
  | { type: "placeStockOrder"; ingredientId: string; vendor: string; qty: number }
  | { type: "updateOrder"; id: string; vendor: string; deliveryDate: string; lines: PurchaseLine[] }
  | { type: "load"; state: KitchenState }
  | { type: "reset" }
  | { type: "setMain"; meal: Meal; dishId: string }
  | { type: "setScheduledMain"; date: string; meal: Meal; dishId: string }
  | { type: "updateResident"; resident: Resident }
  | { type: "logObservation"; observation: Observation }
  | { type: "reviewObservation"; id: string }
  | { type: "markProfileUpdatesSeen" }
  | { type: "acknowledgeProfileUpdate"; id: string }
  | { type: "setStock"; id: string; stock: number }
  | { type: "approveSub"; proposalId: string; meal: Meal; dishId: string; residentIds: string[]; serviceDate?: string | undefined; modified: boolean; summary: string; remember?: boolean }
  | { type: "rejectSub"; proposalId: string; meal: Meal; dishId: string; fromDishId: string; residentIds: string[]; serviceDate?: string | undefined; summary: string }
  | { type: "approvePurchase"; proposalId: string; lines: PurchaseLine[]; modified: boolean; summary: string; vendor?: string; deliveryDate?: string; serviceWeekId?: string | undefined }
  | { type: "reject"; proposalId: string; kind: "substitution" | "purchase"; summary: string; serviceDate?: string | undefined; note?: string; serviceWeekId?: string | undefined }
  | { type: "approveWeeklyPurchasing"; id: string }
  | { type: "createWeeklyPlan"; date: string }
  | { type: "updateWeeklyPlanStatus"; id: string; menuStatus?: WeeklyMenuStatus; purchasingStatus?: WeeklyPurchasingStatus }
  | { type: "selectServiceWeek"; id: string | null }
  | { type: "generateWeeklyMenu"; id: string }
  | { type: "regenerateWeeklyMeal"; id: string; date: string; meal: Meal }
  | { type: "reviseWeeklyMenu"; id: string; date?: string; meal?: Meal }
  | { type: "startWeeklyWorkflow"; date: string }
  | { type: "advanceWeeklyWorkflow"; runId: string; step?: number }
  | { type: "decideWeeklyRevision"; eventId: string; decision: "approve" | "decline" }
  | { type: "requestAnotherWeeklyRevision"; eventId: string }
  | { type: "approveWeeklyMenu"; id: string };

/** Which parts of a resident's care information a staff edit touched. */
export function profileChangeSummary(previous: Resident, next: Resident): string | null {
  const parts: string[] = [];
  if (previous.name !== next.name || previous.room !== next.room || previous.age !== next.age) parts.push("Basic information");
  if (previous.allergens.join("|") !== next.allergens.join("|")) parts.push("Food allergies");
  if (previous.diets.join("|") !== next.diets.join("|")) parts.push("Diet type");
  if (previous.notes !== next.notes) parts.push("Clinical notes");
  if (JSON.stringify(previous.careProfile ?? null) !== JSON.stringify(next.careProfile ?? null)) parts.push("Care profile");
  if ((previous.mealInstructions ?? []).join("|") !== (next.mealInstructions ?? []).join("|")) parts.push("Meal instructions");
  if (previous.photoUrl !== next.photoUrl) parts.push("Profile photo");
  if (previous.likes.join("|") !== next.likes.join("|")) parts.push("Food preferences");
  return parts.length ? parts.join(", ") : null;
}

/** Records an open profile update whenever a staff edit changes a resident's care information. */
function profileUpdateRecord(s: KitchenState, previous: Resident, next: Resident, reference: Date): Pick<KitchenState, "profileUpdates"> {
  const summary = profileChangeSummary(previous, next);
  if (!summary) return {};
  const update: ProfileUpdate = { id: `profile-${next.id}-${reference.getTime()}-${s.profileUpdates?.length ?? 0}`, residentId: next.id, residentName: next.name, at: reference.getTime(), summary, changes: profileContentChanges(previous, next), review: "open" };
  return { profileUpdates: [update, ...(s.profileUpdates ?? [])] };
}

/** Daily-menu edits and decisions that touch a dated service (explicit revisions). */
function editedService(a: Action, reference: Date): { date: string; meal?: Meal } | undefined {
  switch (a.type) {
    case "setMealPlan": case "setScheduledMain": case "rejectMeal": return { date: a.date, meal: a.meal };
    case "approveSub": case "rejectSub": return a.serviceDate ? { date: a.serviceDate, meal: a.meal } : undefined;
    case "setMain": return { date: dateKey(reference), meal: a.meal };
    default: return undefined;
  }
}

export function reducer(s: KitchenState, a: Action, reference = new Date()): KitchenState {
  const next = applyAction(s, a, reference);
  // Any change that alters an approved week's meals or resident requirements (or an explicit
  // daily-screen edit of one) sends that week back for revalidation and renewed approval.
  return next === s ? s : flagApprovedWeekChanges(next, editedService(a, reference), reference);
}

/**
 * Guards against double approval (e.g. a double click): a weekly request is decided once, and a
 * rolling request cannot be decided again while the order it created is still on its way.
 */
function purchaseAlreadyDecided(s: KitchenState, proposalId: string, serviceWeekId: string | undefined) {
  const decided = s.history.some((h) => h.kind === "purchase" && h.proposalId === proposalId);
  if (!decided) return false;
  return Boolean(serviceWeekId) || (s.orders ?? []).some((o) => o.status === "incoming" && o.id.startsWith(`${proposalId}-`));
}

function applyAction(s: KitchenState, a: Action, reference: Date): KitchenState {
  switch (a.type) {
    case "approveEmergencyMenuDemo": return approveEmergencyMenuDemo(s, a.id, reference);
    case "deleteResident": {
      if (!s.residents.some((r) => r.id === a.id)) return s;
      const clear = (meals: Partial<Record<Meal, Record<string, string>>>) => Object.fromEntries(Object.entries(meals).map(([meal, entries]) => [meal, Object.fromEntries(Object.entries(entries ?? {}).filter(([id]) => id !== a.id))]));
      return { ...s,
        residents: s.residents.filter((r) => r.id !== a.id),
        alternativePreferences: (s.alternativePreferences ?? []).filter((p) => p.residentId !== a.id),
        overrides: clear(s.overrides) as KitchenState["overrides"],
        scheduledOverrides: Object.fromEntries(Object.entries(s.scheduledOverrides ?? {}).map(([date, meals]) => [date, clear(meals)])),
      };
    }
    case "addResident": {
      if (!a.resident.name.trim() || !a.resident.room.trim() || !Number.isInteger(a.resident.age) || a.resident.age < 1 || a.resident.age > 120 || s.residents.some((r) => r.id === a.resident.id)) return s;
      return { ...s, residents: [...s.residents, { ...a.resident, name: a.resident.name.trim(), room: a.resident.room.trim() }] };
    }
    case "addRecipe": {
      const r = a.recipe;
      if (!isValidRecipe(r, s.ingredients) || recipeLibrary(s).some((x) => x.id === r.id || x.name.trim().toLowerCase() === r.name.trim().toLowerCase())) return s;
      return { ...s, recipes: [...(s.recipes ?? []), { ...r, name: r.name.trim() }] };
    }
    case "editRecipe": {
      const r = a.recipe;
      const lib = recipeLibrary(s);
      if (!lib.some((x) => x.id === r.id) || !isValidRecipe(r, s.ingredients) || lib.some((x) => x.id !== r.id && x.name.trim().toLowerCase() === r.name.trim().toLowerCase())) return s;
      const saved = s.recipes ?? [];
      const next = { ...r, name: r.name.trim() };
      return { ...s, recipes: saved.some((x) => x.id === r.id) ? saved.map((x) => x.id === r.id ? next : x) : [...saved, next] };
    }
    case "deleteRecipe": {
      if (!recipeLibrary(s).some((x) => x.id === a.id)) return s;
      return { ...s, recipes: (s.recipes ?? []).filter((x) => x.id !== a.id), deletedRecipeIds: [...(s.deletedRecipeIds ?? []), a.id] };
    }
    case "deleteIngredient": {
      if (!s.ingredients.some((i) => i.id === a.id)) return s;
      return { ...s, ingredients: s.ingredients.filter((i) => i.id !== a.id), deletedIngredientIds: [...(s.deletedIngredientIds ?? []), a.id], orders: (s.orders ?? []).map((o) => ({ ...o, lines: o.lines.filter((l) => l.ingredientId !== a.id) })).filter((o) => o.lines.length > 0) };
    }
    case "addIngredient":
    case "updateIngredient": {
      const i = a.ingredient;
      const previous = s.ingredients.find((x) => x.id === i.id);
      if (a.type === "updateIngredient" && !previous) return s;
      if (!i.name.trim() || !i.vendor.trim() || !["kg", "L", "each", ...(previous ? [previous.unit] : [])].includes(i.unit) || (previous && i.unit !== previous.unit) || !Number.isFinite(i.stock) || i.stock < 0 || !Number.isFinite(i.packSize) || i.packSize <= 0 || !Number.isFinite(i.unitCost) || i.unitCost < 0 || i.onOrder !== (previous?.onOrder ?? 0) || (i.category && !FOOD_CATEGORIES.includes(i.category)) || s.ingredients.some((x) => (a.type === "addIngredient" || x.id !== i.id) && (x.id === i.id || x.name.trim().toLowerCase() === i.name.trim().toLowerCase()))) return s;
      if (a.type === "updateIngredient") return { ...s, ingredients: s.ingredients.map((x) => x.id === i.id ? { ...i, name: i.name.trim(), vendor: i.vendor.trim() } : x) };
      return { ...s, ingredients: [...s.ingredients, { ...i, name: i.name.trim(), vendor: i.vendor.trim() }] };
    }
    case "setHorizon": return { ...s, purchaseHorizonDays: a.days };
    case "setLeadTime": return { ...s, leadTimeDays: Math.max(1, Math.min(14, Math.round(a.days) || 2)) };
    case "editAgentProfile": {
      const prev = s.agentEdits?.[a.agent] ?? {};
      return { ...s, agentEdits: { ...s.agentEdits, [a.agent]: { summary: a.summary ?? prev.summary, duties: a.duties ?? prev.duties, config: { ...prev.config, ...a.config } } } };
    }
    case "updateOrder": {
      const order = s.orders?.find((o) => o.id === a.id && o.status === "incoming");
      const parsedDate = new Date(`${a.deliveryDate}T12:00:00`);
      if (!order || !a.vendor.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(a.deliveryDate) || !Number.isFinite(parsedDate.getTime()) || dateKey(parsedDate) !== a.deliveryDate || !a.lines.length || new Set(a.lines.map((l) => l.ingredientId)).size !== a.lines.length || a.lines.some((l) => !s.ingredients.some((i) => i.id === l.ingredientId) || !Number.isFinite(l.qty) || l.qty <= 0)) return s;
      return { ...s,
        orders: (s.orders ?? []).map((o) => o.id === a.id ? { ...o, vendor: a.vendor.trim(), deliveryDate: a.deliveryDate, lines: a.lines.map((l) => ({ ...l, shortage: Math.max(0, Number.isFinite(l.shortage) ? l.shortage : 0) })) } : o),
        ingredients: s.ingredients.map((i) => {
          const before = order.lines.filter((l) => l.ingredientId === i.id).reduce((n, l) => n + l.qty, 0);
          const after = a.lines.find((l) => l.ingredientId === i.id)?.qty ?? 0;
          return { ...i, onOrder: Math.max(0, i.onOrder - before + after) };
        }),
        history: [{ proposalId: order.id, kind: "purchase", status: "approved", at: reference.getTime(), summary: `Updated ${a.vendor.trim()} order · expected ${a.deliveryDate}`, modified: true }, ...s.history],
      };
    }
    case "deleteOrder": {
      const order = s.orders?.find((o) => o.id === a.id);
      if (!order) return s;
      return { ...s, orders: (s.orders ?? []).filter((o) => o.id !== a.id), ingredients: s.ingredients.map((i) => {
        const qty = order.status === "incoming" ? order.lines.filter((line) => line.ingredientId === i.id).reduce((sum, line) => sum + line.qty, 0) : 0;
        return { ...i, onOrder: Math.max(0, i.onOrder - qty) };
      }) };
    }
    case "receiveOrder": {
      const order = s.orders?.find((o) => o.id === a.id && o.status === "incoming");
      if (!order) return s;
      return { ...s, orders: (s.orders ?? []).map((o) => o.id === a.id ? { ...o, status: "received", receivedAt: reference.getTime() } : o), ingredients: s.ingredients.map((i) => {
        const qty = order.lines.filter((line) => line.ingredientId === i.id).reduce((sum, line) => sum + line.qty, 0);
        return { ...i, stock: i.stock + qty, onOrder: Math.max(0, i.onOrder - qty) };
      }) };
    }
    case "load": return a.state;
    case "reset": return seedDemo(initialState(), reference);
    case "setScheduledMain": {
      if (a.date <= dateKey(dayAt(0, reference)) || dishById(a.dishId).meal !== a.meal) return s;
      return { ...s,
        scheduledPlans: { ...s.scheduledPlans, [a.date]: { ...s.scheduledPlans?.[a.date], [a.meal]: a.dishId } },
        scheduledOverrides: { ...s.scheduledOverrides, [a.date]: { ...s.scheduledOverrides?.[a.date], [a.meal]: {} } },
        mealApprovals: { ...s.mealApprovals, [a.date]: { ...s.mealApprovals?.[a.date], [a.meal]: undefined } },
        history: s.history };
    }
    case "setMain": {
      const date = dateKey(reference);
      return { ...s, plan: { ...s.plan, [a.meal]: a.dishId }, scheduledPlans: { ...s.scheduledPlans, [date]: { ...s.scheduledPlans?.[date], [a.meal]: a.dishId } }, overrides: { ...s.overrides, [a.meal]: {} }, scheduledOverrides: { ...s.scheduledOverrides, [date]: { ...s.scheduledOverrides?.[date], [a.meal]: {} } }, mealApprovals: { ...s.mealApprovals, [date]: { ...s.mealApprovals?.[date], [a.meal]: undefined } } };
    }
    case "updateResident": {
      const previous = s.residents.find((r) => r.id === a.resident.id);
      if (!previous) return s;
      const changed = dietarySignature(previous) !== dietarySignature({ ...a.resident, dietaryRevision: previous.dietaryRevision ?? 0 });
      const resident = { ...a.resident, dietaryRevision: (previous.dietaryRevision ?? 0) + (changed ? 1 : 0) };
      if (!changed) return { ...s, residents: s.residents.map((r) => r.id === resident.id ? resident : r), ...profileUpdateRecord(s, previous, resident, reference) };
      const clear = (meals: Partial<Record<Meal, Record<string, string>>>) => Object.fromEntries(Object.entries(meals).map(([meal, entries]) => [meal, Object.fromEntries(Object.entries(entries ?? {}).filter(([id]) => id !== resident.id))]));
      const today = dateKey(reference);
      return { ...s, residents: s.residents.map((r) => r.id === resident.id ? resident : r),
        ...profileUpdateRecord(s, previous, resident, reference),
        alternativePreferences: (s.alternativePreferences ?? []).filter((p) => p.residentId !== resident.id),
        overrides: clear(s.overrides) as KitchenState["overrides"],
        scheduledOverrides: Object.fromEntries(Object.entries(s.scheduledOverrides ?? {}).map(([date, meals]) => [date, date >= today ? clear(meals) : meals])),
      };
    }
    case "logObservation": {
      const o = a.observation;
      if (!s.residents.some((r) => r.id === o.residentId) || dishById(o.dishId).meal !== o.meal || !o.reaction.trim()) return s;
      return { ...s, observations: [{ ...o, reaction: o.reaction.trim() }, ...(s.observations ?? [])] };
    }
    case "reviewObservation": {
      if (!(s.observations ?? []).some((o) => o.id === a.id)) return s;
      return { ...s, observations: (s.observations ?? []).map((o) => (o.id === a.id ? { ...o, status: "reviewed" } : o)) };
    }
    case "markProfileUpdatesSeen": {
      if (!(s.profileUpdates ?? []).some((u) => u.review === "open")) return s;
      return { ...s, profileUpdates: (s.profileUpdates ?? []).map((u) => ({ ...u, review: "seen" })) };
    }
    case "acknowledgeProfileUpdate": {
      if (!s.profileUpdates?.some((u) => u.id === a.id && u.review === "open")) return s;
      return { ...s, profileUpdates: s.profileUpdates.map((u) => u.id === a.id ? { ...u, review: "seen", acknowledgedAt: reference.getTime() } : u) };
    }
    case "setStock": return { ...s, ingredients: s.ingredients.map((i) => (i.id === a.id ? { ...i, stock: Math.max(0, a.stock) } : i)) };
    case "setMealPlan": {
      if (a.date < dateKey(reference) || dishById(a.dishId).meal !== a.meal) return s;
      if (a.date === dateKey(reference) && analyze(s, reference).mealReviews?.some((r) => r.serviceDate === a.date && r.meal === a.meal && r.approved)) return s;
      if (Object.entries(a.overrides).some(([id, dishId]) => {
        const resident = s.residents.find((r) => r.id === id);
        const dish = dishById(dishId);
        return !resident || dish.meal !== a.meal || conflictReasons(resident, dish).length > 0;
      })) return s;
      return { ...s,
        scheduledPlans: { ...s.scheduledPlans, [a.date]: { ...s.scheduledPlans?.[a.date], [a.meal]: a.dishId } },
        scheduledOverrides: { ...s.scheduledOverrides, [a.date]: { ...s.scheduledOverrides?.[a.date], [a.meal]: a.overrides } },
        mealApprovals: { ...s.mealApprovals, [a.date]: { ...s.mealApprovals?.[a.date], [a.meal]: undefined } },
        mealRejections: { ...s.mealRejections, [a.date]: { ...s.mealRejections?.[a.date], [a.meal]: undefined } },
      };
    }
    case "rejectMeal": {
      if (a.date < dateKey(reference)) return s;
      const offset = Math.round((new Date(`${a.date}T12:00:00`).getTime() - new Date(`${dateKey(reference)}T12:00:00`).getTime()) / 86400000);
      const dayState = resolveMenuState(s, offset, reference);
      return { ...s,
        scheduledPlans: { ...s.scheduledPlans, [a.date]: { ...s.scheduledPlans?.[a.date], [a.meal]: dayState.plan[a.meal] } },
        mealApprovals: { ...s.mealApprovals, [a.date]: { ...s.mealApprovals?.[a.date], [a.meal]: undefined } },
        mealRejections: { ...s.mealRejections, [a.date]: { ...s.mealRejections?.[a.date], [a.meal]: { signature: mealSignature(dayState, a.meal), rejectedAt: reference.getTime() } } },
        history: [{ proposalId: `meal-reject-${a.date}-${a.meal}-${reference.getTime()}`, kind: "substitution", status: "rejected", at: reference.getTime(), serviceDate: a.date, summary: `Rejected ${a.meal} menu for ${a.date}`, modified: false }, ...s.history],
      };
    }
    case "approveMeal": {
      if (!canApproveMeal(a.date, reference)) return s;
      const offset = Math.round((new Date(`${a.date}T12:00:00`).getTime() - new Date(`${dateKey(reference)}T12:00:00`).getTime()) / 86400000);
      const dayState = resolveMenuState(s, offset, reference);
      if (analyzeMenuDay(s, offset, reference).conflicts.some((c) => c.meal === a.meal)) return s;
      const signature = mealSignature(dayState, a.meal);
      if (s.mealRejections?.[a.date]?.[a.meal]?.signature === signature) return s;
      return { ...s,
        scheduledPlans: { ...s.scheduledPlans, [a.date]: { ...s.scheduledPlans?.[a.date], [a.meal]: dayState.plan[a.meal] } },
        mealApprovals: { ...s.mealApprovals, [a.date]: { ...s.mealApprovals?.[a.date], [a.meal]: { signature, approvedAt: reference.getTime() } } },
        mealRejections: { ...s.mealRejections, [a.date]: { ...s.mealRejections?.[a.date], [a.meal]: undefined } },
        history: [{ proposalId: `meal-${a.date}-${a.meal}-${reference.getTime()}`, kind: "substitution", status: "approved", at: reference.getTime(), serviceDate: a.date, summary: `Approved ${a.meal} menu for ${a.date}`, modified: false }, ...s.history] };
    }
    case "rejectSub": {
      if (!a.serviceDate || !canApproveMeal(a.serviceDate, reference) || !a.residentIds.length) return s;
      const residentSignatures = Object.fromEntries(s.residents.filter((r) => a.residentIds.includes(r.id)).map((r) => [r.id, dietarySignature(r)]));
      if (Object.keys(residentSignatures).length !== a.residentIds.length) return s;
      const date = a.serviceDate;
      const overrides = { ...s.scheduledOverrides?.[date]?.[a.meal] };
      for (const id of a.residentIds) delete overrides[id];
      return { ...s,
        alternativePreferences: (s.alternativePreferences ?? []).filter((p) => !(p.meal === a.meal && p.fromDishId === a.fromDishId && a.residentIds.includes(p.residentId))),
        scheduledOverrides: { ...s.scheduledOverrides, [date]: { ...s.scheduledOverrides?.[date], [a.meal]: overrides } },
        mealApprovals: { ...s.mealApprovals, [date]: { ...s.mealApprovals?.[date], [a.meal]: undefined } },
        history: [{ proposalId: `${a.proposalId}-decision-${s.history.length}`, kind: "substitution", status: "rejected", at: reference.getTime(), serviceDate: date, summary: a.summary, modified: false, alternativeScope: { meal: a.meal, fromDishId: a.fromDishId, dishId: a.dishId, residentSignatures } }, ...s.history],
      };
    }
    case "approveSub": {
      if (!a.serviceDate || !canApproveMeal(a.serviceDate, reference)) return s;
      if (!a.residentIds.length || dishById(a.dishId).meal !== a.meal || a.residentIds.some((id) => {
        const resident = s.residents.find((r) => r.id === id);
        return !resident || conflictReasons(resident, dishById(a.dishId)).length > 0;
      })) return s;
      if (a.serviceDate) {
        const date = a.serviceDate;
        const o = { ...s.scheduledOverrides?.[date]?.[a.meal] };
        for (const id of a.residentIds) o[id] = a.dishId;
        const offset = Math.round((new Date(`${date}T12:00:00`).getTime() - new Date(`${dateKey(reference)}T12:00:00`).getTime()) / 86400000);
        const fromDishId = scheduledState(s, offset, reference).plan[a.meal];
        const preferences = a.remember ? [
          ...(s.alternativePreferences ?? []).filter((p) => !(p.meal === a.meal && p.fromDishId === fromDishId && a.residentIds.includes(p.residentId))),
          ...a.residentIds.flatMap((residentId) => { const resident = s.residents.find((r) => r.id === residentId); return resident ? [{ residentId, meal: a.meal, fromDishId, dishId: a.dishId, dietarySignature: dietarySignature(resident) }] : []; }),
        ] : s.alternativePreferences?.filter((p) => !(p.meal === a.meal && p.fromDishId === fromDishId && a.residentIds.includes(p.residentId) && p.dishId !== a.dishId));
        return { ...s, scheduledPlans: { ...s.scheduledPlans, [date]: { ...s.scheduledPlans?.[date], [a.meal]: scheduledState(s, offset, reference).plan[a.meal] } },
          ...(preferences ? { alternativePreferences: preferences } : {}),
          scheduledOverrides: { ...s.scheduledOverrides, [date]: { ...s.scheduledOverrides?.[date], [a.meal]: o } },
          mealApprovals: { ...s.mealApprovals, [date]: { ...s.mealApprovals?.[date], [a.meal]: undefined } },
          history: [{ proposalId: `${a.proposalId}-decision-${s.history.length}`, kind: "substitution", status: "approved", at: reference.getTime(), serviceDate: date, summary: a.summary, modified: a.modified, alternativeScope: { meal: a.meal, fromDishId, dishId: a.dishId, residentSignatures: Object.fromEntries(s.residents.filter((r) => a.residentIds.includes(r.id)).map((r) => [r.id, dietarySignature(r)])) } }, ...s.history] };
      }
      const o = { ...s.overrides[a.meal] };
      for (const id of a.residentIds) o[id] = a.dishId;
      return { ...s, overrides: { ...s.overrides, [a.meal]: o }, history: [{ proposalId: a.proposalId, kind: "substitution", status: "approved", at: Date.now(), summary: a.summary, modified: a.modified }, ...s.history] };
    }
    case "placeStockOrder": {
      const parsed = stockOrderSchema.safeParse(a);
      if (!parsed.success || !stockVendors(s).includes(parsed.data.vendor)) return s;
      const { ingredientId, vendor, qty } = parsed.data;
      const estimate = stockOrderEstimate(s, ingredientId, 0, reference);
      const ingredient = s.ingredients.find((i) => i.id === ingredientId);
      if (!estimate || !ingredient) return s;
      const id = `stock-${reference.getTime()}-${s.history.length}`;
      return { ...s,
        orders: [...(s.orders ?? []), { id, vendor, deliveryDate: estimate.deliveryDate, status: "incoming", lines: [{ ingredientId, qty, shortage: 0 }] }],
        ingredients: s.ingredients.map((i) => i.id === ingredientId ? { ...i, onOrder: i.onOrder + qty } : i),
        history: [{ proposalId: id, kind: "purchase", status: "approved", at: reference.getTime(), modified: true, summary: `Ordered ${qty} ${ingredient.unit} ${ingredient.name} from ${vendor} · Estimated $${(qty * ingredient.unitCost).toFixed(2)}` }, ...s.history],
      };
    }
    case "approvePurchase": {
      if (purchaseAlreadyDecided(s, a.proposalId, a.serviceWeekId)) return s;
      // Approval places a (simulated) order that stays incoming until received; stock is unchanged.
      const week = a.serviceWeekId ? { serviceWeekId: a.serviceWeekId } : {};
      const next: KitchenState = {
        ...s,
        orders: [...(s.orders ?? []), { id: `${a.proposalId}-${s.history.length}`, vendor: a.vendor ?? s.ingredients.find((i) => i.id === a.lines[0]?.ingredientId)?.vendor ?? "Supplier", lines: a.lines, deliveryDate: a.deliveryDate ?? dateKey(dayAt(Math.max(1, s.leadTimeDays ?? 2))), status: "incoming", ...week }],
        ingredients: s.ingredients.map((i) => { const l = a.lines.find((x) => x.ingredientId === i.id); return l ? { ...i, onOrder: i.onOrder + l.qty } : i; }),
        history: [{ proposalId: a.proposalId, kind: "purchase", status: "approved", at: Date.now(), summary: a.summary, modified: a.modified, ...week }, ...s.history],
      };
      return a.serviceWeekId ? settleWeeklyPurchasing(next, a.serviceWeekId, reference) : next;
    }
    case "reject": {
      if (a.kind === "purchase" && purchaseAlreadyDecided(s, a.proposalId, a.serviceWeekId)) return s;
      const next: KitchenState = { ...s, history: [{ proposalId: a.proposalId, kind: a.kind, status: "rejected", at: Date.now(), summary: a.summary, modified: false, ...(a.serviceDate ? { serviceDate: a.serviceDate } : {}), ...(a.note ? { note: a.note } : {}), ...(a.serviceWeekId ? { serviceWeekId: a.serviceWeekId } : {}) }, ...s.history] };
      return a.kind === "purchase" && a.serviceWeekId ? settleWeeklyPurchasing(next, a.serviceWeekId, reference) : next;
    }
    case "approveWeeklyPurchasing": return settleWeeklyPurchasing(s, a.id, reference, true);
    case "createWeeklyPlan": {
      // Any date in the week is accepted and snapped to its Monday; one record per week.
      if (!isDateKey(a.date) || s.weeklyPlans?.some((p) => p.id === weeklyPlanId(weekStartFor(a.date)))) return s;
      return { ...s, weeklyPlans: sortWeeklyPlans([...(s.weeklyPlans ?? []), createWeeklyPlan(a.date, reference)]) };
    }
    case "updateWeeklyPlanStatus": {
      // Menu approval only goes through approveWeeklyMenu, which runs the safety checks.
      if (a.menuStatus === "approved") return s;
      const plan = s.weeklyPlans?.find((p) => p.id === a.id);
      const next = plan && applyWeeklyStatus(plan, { menuStatus: a.menuStatus, purchasingStatus: a.purchasingStatus }, reference);
      if (!plan || !next || next === plan) return s;
      return { ...s, weeklyPlans: (s.weeklyPlans ?? []).map((p) => (p.id === a.id ? next : p)) };
    }
    case "selectServiceWeek": {
      if (a.id === null) {
        if (s.selectedWeekId === undefined) return s;
        const { selectedWeekId: _cleared, ...rest } = s;
        return rest;
      }
      if (s.selectedWeekId === a.id || !s.weeklyPlans?.some((p) => p.id === a.id)) return s;
      return { ...s, selectedWeekId: a.id };
    }
    case "generateWeeklyMenu": return generateWeeklyMenu(s, a.id, reference);
    case "regenerateWeeklyMeal": return regenerateWeeklyMeal(s, a.id, a.date, a.meal, reference);
    case "reviseWeeklyMenu": {
      if ((a.date === undefined) !== (a.meal === undefined)) return s;
      return reviseWeeklyMenu(s, a.id, a.date && a.meal ? { date: a.date, meal: a.meal } : undefined, reference);
    }
    case "startWeeklyWorkflow": return startWeeklyWorkflow(s, a.date, reference);
    case "advanceWeeklyWorkflow": {
      const run = s.workflowRuns?.find((r) => r.workflowRunId === a.runId);
      if (a.step !== undefined && run && run.step !== a.step) return s;
      return advanceWeeklyWorkflow(s, a.runId, reference);
    }
    case "decideWeeklyRevision": return decideRevision(s, a.eventId, a.decision, reference);
    case "requestAnotherWeeklyRevision": return requestAnotherRevision(s, a.eventId, reference);
    case "approveWeeklyMenu": {
      if (!weeklyApprovalChecks(s, a.id, reference).ready) return s;
      // Sign off each remaining meal with the existing per-meal approval, then the week.
      let next = s;
      for (const slot of weeklyMenu(s, a.id, reference).slots) {
        if (!slot.approved && slot.lock !== "past" && canApproveMeal(slot.date, reference)) next = applyAction(next, { type: "approveMeal", date: slot.date, meal: slot.meal }, reference);
      }
      // Purchasing is reviewed separately: approval only opens the week's draft purchasing list.
      return openWeeklyPurchasing(approveWeeklyMenu(next, a.id, reference), a.id, reference);
    }
  }
}

/** Demo seed: signs off a few upcoming services and adds past decisions so every tab has examples. */
export function seedDemo(base: KitchenState, reference = new Date()): KitchenState {
  let s: KitchenState = { ...base, seeded: true };
  const day = 86400000;
  for (const offset of [2, 3, 4]) {
    const date = dateKey(dayAt(offset, reference));
    for (const p of analyze(s, reference).proposals) {
      if (p.kind === "substitution" && p.serviceDate === date) s = reducer(s, { type: "approveSub", proposalId: p.id, meal: p.meal, dishId: p.dishId, residentIds: p.residentIds, serviceDate: date, modified: false, summary: `Approved ${date} ${p.meal} swap to ${dishById(p.dishId).name}` }, reference);
    }
    for (const meal of ["breakfast", "lunch", "dinner"] as Meal[]) s = reducer(s, { type: "approveMeal", date, meal }, reference);
  }
  const past = [1, 2, 4, 6, 9, 12, 18, 25].map((ago, i): KitchenState["history"][number] => {
    const date = dateKey(dayAt(-ago, reference));
    const meal = (["breakfast", "lunch", "dinner"] as Meal[])[i % 3]!;
    return i % 4 === 3
      ? { proposalId: `seed-${ago}`, kind: "purchase", status: "approved", at: reference.getTime() - ago * day, summary: `Approved Sysco produce order ($${(80 + ago * 7).toFixed(2)})`, modified: false }
      : { proposalId: `seed-${ago}`, kind: "substitution", status: i % 5 === 4 ? "rejected" : "approved", at: reference.getTime() - (ago + 1) * day, serviceDate: date, summary: `${i % 5 === 4 ? "Rejected" : "Approved"} ${meal} menu for ${date}`, modified: i % 3 === 1 };
  });
  return migrateDemoContent({ ...s, history: [...s.history.map((h, i) => ({ ...h, at: reference.getTime() - (i % 3 + 1) * 3600000 })), ...past] }, reference);
}

/** Replaces outdated resident records and clears decisions tied to the previous residents. */
export function migrateResidentProfiles(s: KitchenState): KitchenState {
  if (s.residentProfileVersion === RESIDENT_PROFILE_VERSION) return s;
  return { ...s, residentProfileVersion: RESIDENT_PROFILE_VERSION, residents: RESIDENTS.map((r) => ({ ...r, likes: [...r.likes], allergens: [...r.allergens], diets: [...r.diets], ...(r.careProfile ? { careProfile: { ...r.careProfile } } : {}), ...(r.mealInstructions ? { mealInstructions: [...r.mealInstructions] } : {}) })), overrides: { breakfast: {}, lunch: {}, dinner: {} }, scheduledOverrides: {}, alternativePreferences: [], mealApprovals: {}, mealRejections: {} };
}

const KEY = "kitchen-command-v1";
/** Pause between orchestration steps so staff can follow the handoffs as they happen. */
const WORKFLOW_STEP_DELAY_MS = 900;
/** Moves saved menus from the old sample dishes onto recipe-library dishes. */
export function migrateMenuDishes(s: KitchenState): KitchenState {
  const id = currentDishId;
  const mapMeals = <T extends Partial<Record<string, string>>>(m: T) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v ? id(v) : v])) as T;
  const mapOverrides = (o: KitchenState["overrides"]) => Object.fromEntries(Object.entries(o).map(([meal, rs]) => [meal, mapMeals(rs)])) as KitchenState["overrides"];
  return {
    ...s,
    plan: mapMeals(s.plan),
    overrides: mapOverrides(s.overrides),
    ...(s.scheduledPlans ? { scheduledPlans: Object.fromEntries(Object.entries(s.scheduledPlans).map(([d, p]) => [d, mapMeals(p)])) } : {}),
    ...(s.scheduledOverrides ? { scheduledOverrides: Object.fromEntries(Object.entries(s.scheduledOverrides).map(([d, o]) => [d, mapOverrides(o as KitchenState["overrides"])])) as NonNullable<KitchenState["scheduledOverrides"]> } : {}),
    ...(s.alternativePreferences ? { alternativePreferences: s.alternativePreferences.map((p) => ({ ...p, dishId: id(p.dishId), fromDishId: id(p.fromDishId) })) } : {}),
    ...(s.observations ? { observations: s.observations.map((o) => ({ ...o, dishId: id(o.dishId) })) } : {}),
  };
}
/** Add illustrative orders once without replacing staff-created orders or available stock. */
export function migrateOrderSnapshot(s: KitchenState, reference = new Date()): KitchenState {
  if (s.orderSnapshotVersion === 1) return s;
  const base = { ...s, orderSnapshotVersion: 1 };
  if (s.orders?.length) return base;
  const specs = [
    { id: "snapshot-delivery-1", ingredientId: "carrots", qty: 5, offset: -1 },
    { id: "snapshot-delivery-2", ingredientId: "milk", qty: 4, offset: 0 },
    { id: "snapshot-incoming-3", ingredientId: "rice", qty: 5, offset: 3 },
  ];
  const orders = specs.flatMap((spec) => {
    const ingredient = s.ingredients.find((i) => i.id === spec.ingredientId);
    return ingredient ? [{ id: spec.id, vendor: ingredient.vendor, lines: [{ ingredientId: ingredient.id, qty: spec.qty, shortage: 0 }], deliveryDate: dateKey(dayAt(spec.offset, reference)), status: "incoming" as const }] : [];
  });
  return { ...base, orders, ingredients: s.ingredients.map((i) => ({ ...i, onOrder: i.onOrder + orders.flatMap((o) => o.lines).filter((l) => l.ingredientId === i.id).reduce((n, l) => n + l.qty, 0) })) };
}
export function migrateAdditionalResidents(s: KitchenState): KitchenState {
  if (s.additionalResidentsVersion === 1) return s;
  return { ...s, additionalResidentsVersion: 1, residents: [...s.residents, ...RESIDENTS.filter((r) => Number(r.id.slice(1)) >= 16 && !s.residents.some((existing) => existing.id === r.id))] };
}
export function mergeIngredientCatalog(s: KitchenState): KitchenState {
  return { ...s, ingredients: [...s.ingredients, ...[...INGREDIENTS, ...ADDITIONAL_INGREDIENTS].filter((i) => !s.ingredients.some((x) => x.id === i.id) && !s.deletedIngredientIds?.includes(i.id)).map((i) => ({ ...i }))] };
}
type KitchenContextValue = { state: KitchenState; analysis: Analysis; dispatch: (a: Action) => void; reference: Date };
// Mixed component/function exports can refresh consumers before the mounted provider.
// Preserve the context identity across hot updates so both generations share it.
const Ctx: Context<KitchenContextValue | null> = import.meta.hot?.data?.["kitchenContext"] ?? createContext<KitchenContextValue | null>(null);
if (import.meta.hot?.data) import.meta.hot.data["kitchenContext"] = Ctx;

function localSeedState(): KitchenState {
  let saved: KitchenState | null = null;
  try { const raw = localStorage.getItem(KEY); saved = raw ? JSON.parse(raw) as KitchenState : null; } catch { /* ignore */ }
  return prepareState(saved);
}
/** Versioned, idempotent migrations applied to any loaded state (local seed or shared snapshot). */
export function prepareState(saved: KitchenState | null): KitchenState {
  // Catalog grows over time: merge ingredients the saved state doesn't know yet.
  const withIngredients = saved ? mergeIngredientCatalog(saved) : null;
  const merged = withIngredients ? migrateAdditionalResidents(migrateResidentProfiles(withIngredients)) : null;
  const migrated = migrateMenuReset(migrateMealHistory(migrateApprovalCleanup(migrateAgentWorkflow(migrateWeeklyPlans(migrateDemoContent(migrateMenuDishes(migrateOrderSnapshot(merged?.seeded ? merged : seedDemo(merged ?? initialState())))))))));
  return migrateInventoryReplenishment(migrated);
}
const sharedReduce = (s: KitchenState, a: Action, ref: Date) => reducer(s, a, ref);
type ActionRow = { id: number; client_id: string; action: unknown; acted_at: string };

export function KitchenProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<KitchenState | null>(null);
  const confirmed = useRef<{ state: KitchenState; lastId: number; snapshotId: number } | null>(null);
  const pending = useRef<{ key: string; action: Action; at: number }[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [reference, setReference] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    setReference(new Date());
    const timer = window.setInterval(() => setReference(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const show = () => { if (confirmed.current) {
    restoreKitchenCatalog(confirmed.current.state);
    const next = rebuild(confirmed.current.state, pending.current, sharedReduce);
    restoreKitchenCatalog(next);
    setState(next);
  } };
  // Pull every shared action this browser has not applied yet, in database order.
  const catchUp = () => { queue.current = queue.current.then(async () => {
    const base = confirmed.current; if (!base) return;
    restoreKitchenCatalog(base.state);
    const { data, error } = await supabase.from("kitchen_actions").select("id, client_id, action, acted_at").gt("id", base.lastId).order("id").limit(1000);
    if (error || !data?.length) return;
    let next = base.state;
    for (const row of data as ActionRow[]) {
      next = replayAt(next, row.action as Action, new Date(row.acted_at).getTime(), sharedReduce);
      pending.current = pending.current.filter((p) => p.key !== row.client_id);
    }
    const lastId = (data[data.length - 1] as ActionRow).id;
    confirmed.current = { ...base, state: next, lastId };
    show();
    if (data.length === 1000) catchUp();
  }).catch(() => undefined); };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const catalogs = await loadKitchenCatalogs();
      let { data: snap } = await supabase.from("kitchen_snapshot").select("state, through_action_id").eq("id", 1).maybeSingle();
      if (!snap) {
        // First visit ever: this browser's kitchen becomes the shared starting point.
        await supabase.from("kitchen_snapshot").upsert({ id: 1, state: localSeedState() as never, through_action_id: 0 }, { onConflict: "id", ignoreDuplicates: true });
        ({ data: snap } = await supabase.from("kitchen_snapshot").select("state, through_action_id").eq("id", 1).maybeSingle());
      }
      if (cancelled) return;
      let base = prepareState((snap?.state as unknown as KitchenState) ?? null);
      const through = snap?.through_action_id ?? 0;
      let lastId = through;
      // Replay once against the original snapshot to preserve care-update comparisons;
      // then use table records instead of stale embedded residents/recipes.
      while (true) {
        const { data, error } = await supabase.from("kitchen_actions").select("id, client_id, action, acted_at").gt("id", lastId).order("id").limit(1000);
        if (error) throw error;
        for (const row of (data ?? []) as ActionRow[]) { base = replayAt(base, row.action as Action, new Date(row.acted_at).getTime(), sharedReduce); lastId = row.id; }
        if (!data || data.length < 1000) break;
      }
      if (cancelled) return;
      confirmed.current = { state: withKitchenCatalogs(base, catalogs), lastId, snapshotId: through };
      show();
      catchUp();
    })().catch(() => { if (!cancelled) setLoadError(true); });
    const channel = supabase.channel(`kitchen-actions-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "kitchen_actions" }, () => catchUp())
      .subscribe();
    const poll = window.setInterval(catchUp, 30000);
    return () => { cancelled = true; supabase.removeChannel(channel); window.clearInterval(poll); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dispatch = useCallback((a: Action) => {
    if (!confirmed.current || a.type === "load") return;
    const entry = { key: crypto.randomUUID(), action: a, at: Date.now() };
    pending.current = [...pending.current, entry];
    show();
    void supabase.from("kitchen_actions").insert({ client_id: entry.key, action: a as never, acted_at: new Date(entry.at).toISOString() }).then(({ error }) => {
      if (error) { pending.current = pending.current.filter((p) => p.key !== entry.key); show(); console.error("Could not save change", error.message); }
      else catchUp();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep a local copy so a brand-new shared kitchen can start from this browser's data.
  useEffect(() => { if (state) try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota */ } }, [state]);
  // Weekly agent workflows advance one shared step at a time; the step guard means several open
  // browsers advancing together still move the run forward only once.
  const runningRun = state?.workflowRuns?.find((r) => r.status === "running");
  useEffect(() => {
    if (!runningRun) return;
    const timer = window.setTimeout(() => dispatch({ type: "advanceWeeklyWorkflow", runId: runningRun.workflowRunId, step: runningRun.step }), WORKFLOW_STEP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [runningRun?.workflowRunId, runningRun?.step]); // eslint-disable-line react-hooks/exhaustive-deps
  const analysis = useMemo(() => {
    if (!state) return null;
    restoreKitchenCatalog(state);
    return analyze(state, reference ?? new Date("2026-01-01T12:00:00Z"));
  }, [state, reference]);
  if (loadError) return <div className="min-h-screen bg-background p-8 text-destructive" role="alert">Kitchen records could not be loaded. Please refresh to try again.</div>;
  if (!reference || !state || !analysis) return <div className="min-h-screen bg-background" aria-busy="true" />;
  return <Ctx.Provider value={{ state, analysis, dispatch, reference }}>{children}</Ctx.Provider>;
}

export function useKitchen() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useKitchen outside provider");
  return c;
}

/**
 * Shared weekly menu selector for the Agent Workspace, calendar and approval screens.
 * Pass a WeeklyPlan id or any date in the week; defaults to the selected service week.
 */
export function useWeeklyMenu(idOrDate?: string): WeeklyMenu | null {
  const { state, reference } = useKitchen();
  const target = idOrDate ?? state.selectedWeekId;
  return useMemo(() => {
    if (!target) return null;
    if (!isDateKey(target) && !state.weeklyPlans?.some((p) => p.id === target)) return null;
    return weeklyMenu(state, target, reference);
  }, [state, target, reference]);
}

/** Week-specific purchasing for every service week that has not ended (derived, never stored). */
export function useWeeklyPurchasing(): WeeklyPurchasePlan[] {
  const { state, reference } = useKitchen();
  return useMemo(() => activeWeeklyPurchasing(state, reference), [state, reference]);
}

export const residentName = (s: KitchenState, id: string) => s.residents.find((r) => r.id === id)?.name ?? id;
export { dishById };
