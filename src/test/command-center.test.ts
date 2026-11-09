import { describe, expect, it } from "vitest";
import { initialState } from "@/lib/kitchen/data";
import { reducer, seedDemo, migrateOrderSnapshot } from "@/lib/kitchen/store";
import { analyze } from "@/lib/kitchen/engine";
import { actionCards, dailySnapshot, openObservations, reviewedObservations } from "@/lib/kitchen/overview";
import { profileContentChanges } from "@/lib/kitchen/profile-changes";
import { dateKey, dayAt } from "@/lib/kitchen/schedule";
import type { KitchenState, Observation } from "@/lib/kitchen/types";

const REFERENCE = new Date("2026-11-09T12:00:00");
const cardValue = (state: KitchenState, id: string) => actionCards(state, analyze(state, REFERENCE), REFERENCE).find((c) => c.id === id)?.value;

describe("command center action cards", () => {
  it("shows the four action cards and counts only open work", () => {
    const state: KitchenState = {
      ...initialState(),
      orders: [
        { id: "o1", vendor: "Sysco", deliveryDate: dateKey(dayAt(2, REFERENCE)), status: "incoming", lines: [{ ingredientId: "milk", shortage: 1, qty: 2 }, { ingredientId: "carrots", shortage: 1, qty: 1 }] },
        { id: "o2", vendor: "Valley Farms", deliveryDate: dateKey(dayAt(-1, REFERENCE)), status: "received", lines: [{ ingredientId: "bananas", shortage: 1, qty: 4 }] },
      ],
      profileUpdates: [
        { id: "u1", residentId: "R001", at: 1, summary: "Diet type", review: "open" },
        { id: "u2", residentId: "R002", at: 2, summary: "Food allergies", review: "seen" },
      ],
    };
    const cards = actionCards(state, analyze(state, REFERENCE), REFERENCE);
    expect(cards.map((c) => c.label)).toEqual(["Awaiting approval", "Ingredient shortfalls", "Delivered orders", "Incoming orders", "Resident profile updates"]);
    expect(cards.map((c) => c.id)).toEqual(["approvals", "shortfalls", "delivered", "incoming", "profiles"]);
    expect(cardValue(state, "incoming")).toBe(1);
    expect(cardValue(state, "profiles")).toBe(1);
    expect(cardValue(state, "approvals")).toBeGreaterThan(0);
  });

  it("counts due unconfirmed deliveries and clears them after receipt", () => {
    const s = reducer(initialState(), { type: "approvePurchase", proposalId: "due", vendor: "Sysco", deliveryDate: "2026-11-09", lines: [{ ingredientId: "milk", qty: 2, shortage: 2 }], modified: false, summary: "Order" }, REFERENCE);
    expect(cardValue(s, "delivered")).toBe(1);
    const id = s.orders?.[0]?.id;
    if (!id) throw new Error("Missing order");
    expect(cardValue(reducer(s, { type: "receiveOrder", id }, REFERENCE), "delivered")).toBe(0);
    expect(actionCards(s, analyze(s, REFERENCE), REFERENCE).find((c) => c.id === "delivered")?.inventoryView).toBe("delivered");
    expect(actionCards(s, analyze(s, REFERENCE), REFERENCE).find((c) => c.id === "incoming")?.inventoryView).toBe("incoming");
  });

  it("opens a resident profile update when a staff edit changes food requirements", () => {
    const state = initialState();
    const resident = state.residents.find((r) => r.id === "R001");
    if (!resident) throw new Error("Missing R001");
    const edited = { ...resident, diets: [...resident.diets, "low-sodium" as const] };
    const next = reducer(state, { type: "updateResident", resident: edited }, REFERENCE);
    expect(next.profileUpdates?.[0]).toMatchObject({ residentId: "R001", review: "open", summary: "Diet type" });
    expect(cardValue(next, "profiles")).toBe(1);
    expect(reducer(state, { type: "updateResident", resident }, REFERENCE).profileUpdates).toBeUndefined();
  });

  it("turns the profile update card peaceful once staff mark the changes reviewed", () => {
    const state = initialState();
    const resident = state.residents.find((r) => r.id === "R001");
    if (!resident) throw new Error("Missing R001");
    const next = reducer(state, { type: "updateResident", resident: { ...resident, diets: [...resident.diets, "soft" as const] } }, REFERENCE);
    const cleared = reducer(next, { type: "markProfileUpdatesSeen" }, REFERENCE);
    expect((cleared.profileUpdates ?? []).filter((u) => u.review === "open")).toHaveLength(0);
    expect(cardValue(cleared, "profiles")).toBe(0);
    expect(actionCards(cleared, analyze(cleared, REFERENCE)).find((c) => c.id === "profiles")?.clearLabel).toBe("All profiles reviewed");
  });
});

describe("snapshot and profile acknowledgment", () => {
  it("starts with two due deliveries and three incoming orders without increasing stock", () => {
    const base = initialState();
    const next = migrateOrderSnapshot(base, REFERENCE);
    expect(cardValue(next, "delivered")).toBe(2);
    expect(cardValue(next, "incoming")).toBe(3);
    expect(next.ingredients.map((i) => i.stock)).toEqual(base.ingredients.map((i) => i.stock));
    expect(next.ingredients.find((i) => i.id === "carrots")?.onOrder).toBe(5);
    expect(migrateOrderSnapshot(next, REFERENCE)).toBe(next);
  });

  it("preserves staff orders when initializing the demo", () => {
    const base = reducer(initialState(), { type: "approvePurchase", proposalId: "staff", deliveryDate: "2026-11-12", lines: [{ ingredientId: "milk", qty: 2, shortage: 2 }], modified: false, summary: "Staff order" }, REFERENCE);
    expect(migrateOrderSnapshot(base, REFERENCE).orders).toEqual(base.orders);
  });

  it("derives counts and cost from current data without mixing kg, L, and counts", () => {
    const state = initialState();
    const analysis = { ...analyze(state, REFERENCE), demand: { carrots: 0.08, milk: 0.2, eggs: 2 } };
    const snapshot = dailySnapshot(state, analysis);
    expect(snapshot.residents).toBe(20);
    expect(snapshot.recipes).toBe(135);
    expect(snapshot.meals).toBe(60);
    expect(snapshot.quantities["kg"]).toBe(0.08);
    expect(snapshot.quantities["L"]).toBe(0.2);
    expect(snapshot.quantities["each"]).toBe(2);
    expect(snapshot.cost).toBeCloseTo(0.08 * 1.8 + 0.2 * 1.4 + 2 * 0.35);
  });

  it("records previous and updated favorite foods and notes, then acknowledges just that record", () => {
    const base = initialState();
    const resident = base.residents[0];
    if (!resident) throw new Error("Missing resident");
    const edited = { ...resident, likes: ["Carrot soup"], notes: "Requires assistance at dinner" };
    const next = reducer(base, { type: "updateResident", resident: edited }, REFERENCE);
    expect(next.profileUpdates?.[0]?.changes).toContainEqual({ field: "Favorite foods", before: resident.likes.join(", "), after: "Carrot soup" });
    expect(next.profileUpdates?.[0]?.changes).toContainEqual({ field: "Clinical notes", before: resident.notes, after: "Requires assistance at dinner" });
    const second = reducer(next, { type: "updateResident", resident: { ...edited, notes: "Updated assistance" } }, new Date(REFERENCE.getTime() + 1000));
    const id = next.profileUpdates?.[0]?.id;
    if (!id) throw new Error("Missing update");
    const acknowledged = reducer(second, { type: "acknowledgeProfileUpdate", id }, REFERENCE);
    expect(acknowledged.profileUpdates?.find((u) => u.id === id)).toMatchObject({ review: "seen", acknowledgedAt: REFERENCE.getTime() });
    expect(acknowledged.profileUpdates?.[0]?.review).toBe("open");
    expect(reducer(acknowledged, { type: "acknowledgeProfileUpdate", id }, REFERENCE)).toBe(acknowledged);
    expect(actionCards(next, analyze(next, REFERENCE), REFERENCE).find((c) => c.id === "profiles")?.to).toBe("/profile-updates");
  });

  it("captures added and removed care fields, instructions, photo and basic details", () => {
    const resident = initialState().residents[0];
    if (!resident) throw new Error("Missing resident");
    const before = { ...resident, careProfile: { Mobility: "Independent", Extra: "Old" }, mealInstructions: ["Before"] };
    const changes = profileContentChanges(before, { ...before, name: "New name", age: 80, room: "99", careProfile: { Mobility: "Assisted" }, mealInstructions: ["After"], photoUrl: "data:image/png;base64,new" });
    expect(changes).toContainEqual({ field: "Care profile · Extra", before: "Old", after: "" });
    expect(changes).toContainEqual({ field: "Care profile · Mobility", before: "Independent", after: "Assisted" });
    expect(changes).toContainEqual({ field: "Meal instructions", before: "Before", after: "After" });
    expect(changes.find((c) => c.field === "Profile photo")?.kind).toBe("photo");
    expect(changes.find((c) => c.field === "Room")?.after).toBe("99");
  });
});

describe("observation board", () => {
  const observation = (over: Partial<Observation> = {}): Observation => ({
    id: "obs-1",
    residentId: "R001",
    serviceDate: dateKey(dayAt(-1, REFERENCE)),
    meal: "lunch",
    dishId: "l-lentil",
    reaction: "  Refused most of the tray  ",
    severity: "concern",
    status: "open",
    notedAt: REFERENCE.getTime(),
    ...over,
  });

  it("adds a trimmed meal reaction to the board and clears it once reviewed", () => {
    const logged = reducer(initialState(), { type: "logObservation", observation: observation() }, REFERENCE);
    expect(openObservations(logged)).toHaveLength(1);
    expect(openObservations(logged)[0]?.reaction).toBe("Refused most of the tray");
    const reviewed = reducer(logged, { type: "reviewObservation", id: "obs-1" }, REFERENCE);
    expect(openObservations(reviewed)).toHaveLength(0);
    expect(reviewedObservations(reviewed)).toHaveLength(1);
  });

  it("orders reactions needing follow-up ahead of notes", () => {
    const state = reducer(initialState(), { type: "logObservation", observation: observation({ id: "obs-note", severity: "note", reaction: "Asked for a second portion", notedAt: REFERENCE.getTime() + 1 }) }, REFERENCE);
    const logged = reducer(state, { type: "logObservation", observation: observation({ id: "obs-concern", severity: "concern", reaction: "Nausea reported after the meal", notedAt: REFERENCE.getTime() }) }, REFERENCE);
    expect(openObservations(logged).map((o) => o.id)).toEqual(["obs-concern", "obs-note"]);
  });

  it("rejects reactions for a missing resident, a mismatched dish or empty text", () => {
    const state = initialState();
    expect(reducer(state, { type: "logObservation", observation: observation({ dishId: "b-oatmeal" }) }, REFERENCE)).toBe(state);
    expect(reducer(state, { type: "logObservation", observation: observation({ residentId: "R999" }) }, REFERENCE)).toBe(state);
    expect(reducer(state, { type: "logObservation", observation: observation({ reaction: "   " }) }, REFERENCE)).toBe(state);
  });

  it("starts a demo day with reactions waiting on the board", () => {
    const state = seedDemo(initialState(), REFERENCE);
    expect(openObservations(state).length).toBeGreaterThan(0);
    expect(openObservations(state).every((o) => state.residents.some((r) => r.id === o.residentId))).toBe(true);
  });
});
