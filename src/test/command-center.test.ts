import { describe, expect, it } from "vitest";
import { initialState } from "@/lib/kitchen/data";
import { reducer, seedDemo } from "@/lib/kitchen/store";
import { analyze } from "@/lib/kitchen/engine";
import { actionCards, openObservations, reviewedObservations } from "@/lib/kitchen/overview";
import { dateKey, dayAt } from "@/lib/kitchen/schedule";
import type { KitchenState, Observation } from "@/lib/kitchen/types";

const REFERENCE = new Date("2026-11-09T12:00:00");
const cardValue = (state: KitchenState, id: string) => actionCards(state, analyze(state, REFERENCE)).find((c) => c.id === id)?.value;

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
    const cards = actionCards(state, analyze(state, REFERENCE));
    expect(cards.map((c) => c.label)).toEqual(["Awaiting approval", "Ingredient shortfalls", "Incoming ingredient orders", "Resident profile updates"]);
    expect(cards.map((c) => c.id)).toEqual(["approvals", "shortfalls", "incoming", "profiles"]);
    expect(cardValue(state, "incoming")).toBe(2);
    expect(cardValue(state, "profiles")).toBe(1);
    expect(cardValue(state, "approvals")).toBeGreaterThan(0);
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
