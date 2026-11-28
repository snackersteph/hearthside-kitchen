import { describe, expect, it } from "vitest";
import { dishById, initialState } from "@/lib/kitchen/data";
import { observationVersions, residentObservations, sameDayObservations, searchObservations } from "@/lib/kitchen/observations";
import { reducer } from "@/lib/kitchen/store";
import type { Observation } from "@/lib/kitchen/types";

const LOGGED_AT = new Date("2026-11-09T12:00:00");
const EDITED_AT = new Date("2026-11-10T09:30:00");

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: "obs-history",
    residentId: "R001",
    serviceDate: "2026-11-08",
    meal: "lunch",
    dishId: "l-lentil",
    reaction: "  Refused most of the tray  ",
    severity: "concern",
    status: "open",
    notedAt: LOGGED_AT.getTime(),
    ...overrides,
  };
}

describe("resident observation history", () => {
  it("saves the previous values when staff edit an observation", () => {
    const logged = reducer(initialState(), { type: "logObservation", observation: observation() }, LOGGED_AT);
    const edited = reducer(logged, {
      type: "editObservation",
      id: "obs-history",
      serviceDate: "2026-11-07",
      meal: "lunch",
      dishId: "l-lentil",
      reaction: "  Accepted half after encouragement  ",
      severity: "note",
    }, EDITED_AT);
    const current = edited.observations?.find((entry) => entry.id === "obs-history");
    expect(current).toMatchObject({
      residentId: "R001",
      serviceDate: "2026-11-07",
      reaction: "Accepted half after encouragement",
      severity: "note",
      notedAt: LOGGED_AT.getTime(),
      updatedAt: EDITED_AT.getTime(),
    });
    expect(current?.history).toEqual([expect.objectContaining({
      savedAt: LOGGED_AT.getTime(),
      serviceDate: "2026-11-08",
      reaction: "Refused most of the tray",
      severity: "concern",
      status: "open",
    })]);
    if (!current) throw new Error("Edited observation missing");
    expect(observationVersions(current)).toHaveLength(2);
  });

  it("retains the open version when staff mark a concern reviewed", () => {
    const logged = reducer(initialState(), { type: "logObservation", observation: observation() }, LOGGED_AT);
    const reviewed = reducer(logged, { type: "reviewObservation", id: "obs-history" }, EDITED_AT);
    const current = reviewed.observations?.[0];
    expect(current).toMatchObject({ status: "reviewed", updatedAt: EDITED_AT.getTime() });
    expect(current?.history?.[0]).toMatchObject({ status: "open", savedAt: LOGGED_AT.getTime() });
    expect(reducer(reviewed, { type: "reviewObservation", id: "obs-history" }, EDITED_AT)).toBe(reviewed);
  });

  it("rejects empty edits, mismatched dishes and unknown observations without creating history", () => {
    const logged = reducer(initialState(), { type: "logObservation", observation: observation() }, LOGGED_AT);
    const base = { id: "obs-history", serviceDate: "2026-11-08", meal: "lunch" as const, dishId: "l-lentil", reaction: "Refused most of the tray", severity: "concern" as const };
    expect(reducer(logged, { type: "editObservation", ...base, reaction: "   " }, EDITED_AT)).toBe(logged);
    expect(reducer(logged, { type: "editObservation", ...base, dishId: "b-oatmeal" }, EDITED_AT)).toBe(logged);
    expect(reducer(logged, { type: "editObservation", ...base, id: "missing" }, EDITED_AT)).toBe(logged);
    expect(reducer(logged, { type: "editObservation", ...base }, EDITED_AT)).toBe(logged);
  });
});

describe("resident observation search", () => {
  it("expands only other logs for the selected resident on the same day", () => {
    const entries = [observation(), observation({ id: "same-day", meal: "dinner" }), observation({ id: "other-day", serviceDate: "2026-11-07" }), observation({ id: "other-resident", residentId: "R002" })];
    expect(sameDayObservations(entries, "R001", "obs-history").map((entry) => entry.id)).toEqual(["same-day"]);
    expect(sameDayObservations(entries, "R001", "other-resident")).toEqual([]);
    expect(sameDayObservations(entries, "R001", "missing")).toEqual([]);
  });
  it("shows only the selected entry, including its own saved versions", () => {
    const selected = observation({ history: [{ savedAt: 1, serviceDate: "2026-11-08", meal: "lunch", dishId: "l-lentil", reaction: "Earlier note", severity: "note", status: "open" }] });
    const entries = [selected, observation({ id: "another-entry" }), observation({ id: "other-resident", residentId: "R002" })];
    expect(residentObservations(entries, "R001", "obs-history")).toEqual([selected]);
    expect(observationVersions(selected)).toHaveLength(2);
    expect(residentObservations(entries, "R001", "other-resident")).toEqual([]);
    expect(residentObservations(entries, "R001", "missing")).toEqual([]);
  });

  it("shows all and only the resident's entries when opening full history", () => {
    const entries = [observation(), observation({ id: "another-entry" }), observation({ id: "other-resident", residentId: "R002" })];
    expect(residentObservations(entries, "R001").map((entry) => entry.id)).toEqual(["obs-history", "another-entry"]);
  });
  it("finds current entries by reaction, dish, formatted date and status", () => {
    const entries = [observation({ reaction: "Refused most of the tray" })];
    expect(searchObservations(entries, "refused")).toHaveLength(1);
    const entry = entries[0];
    if (!entry) throw new Error("Search fixture missing");
    expect(searchObservations(entries, dishById(entry.dishId).name)).toHaveLength(1);
    expect(searchObservations(entries, "Nov 8, 2026")).toHaveLength(1);
    expect(searchObservations(entries, "needs follow-up")).toHaveLength(1);
    expect(searchObservations(entries, "no matching observation")).toHaveLength(0);
    expect(searchObservations(entries, "   ")).toBe(entries);
  });
});
