import { dishById } from "./data";
import type { Observation, ObservationVersion } from "./types";

type ObservationChanges = Partial<Pick<Observation, "serviceDate" | "meal" | "dishId" | "reaction" | "severity" | "status">>;

/** An entry link never expands to unrelated entries or another resident's log. */
export function residentObservations(observations: Observation[], residentId: string, observationId: string | null = null): Observation[] {
  return observations.filter((entry) => entry.residentId === residentId && (observationId === null || entry.id === observationId))
    .sort((a, b) => b.notedAt - a.notedAt);
}

/** Expand only other entries on the selected resident's service date. */
export function sameDayObservations(observations: Observation[], residentId: string, observationId: string): Observation[] {
  const selected = residentObservations(observations, residentId, observationId)[0];
  if (!selected) return [];
  return residentObservations(observations, residentId).filter((entry) => entry.id !== selected.id && entry.serviceDate === selected.serviceDate);
}

/** Capture the version being replaced, including when that version was originally saved. */
export function observationVersion(observation: Observation): ObservationVersion {
  return {
    savedAt: observation.updatedAt ?? observation.notedAt,
    serviceDate: observation.serviceDate,
    meal: observation.meal,
    dishId: observation.dishId,
    reaction: observation.reaction,
    severity: observation.severity,
    status: observation.status,
  };
}

/** Preserve the replaced version in the same shared observation record. */
export function reviseObservation(observation: Observation, changes: ObservationChanges, at: number): Observation {
  return {
    ...observation,
    ...changes,
    updatedAt: at,
    history: [...(observation.history ?? []), observationVersion(observation)],
  };
}

/** Current version first, followed by prior versions from newest to oldest. */
export function observationVersions(observation: Observation): ObservationVersion[] {
  return [observationVersion(observation), ...(observation.history ?? []).slice().reverse()];
}

export function observationStatusLabel(observation: Pick<Observation, "severity" | "status">): string {
  if (observation.severity === "note") return observation.status === "reviewed" ? "Note · reviewed" : "Note only";
  return observation.status === "open" ? "Needs follow-up" : "Reviewed";
}

/** Search current entries by their human-readable details, not internal IDs alone. */
export function searchObservations(observations: Observation[], query: string): Observation[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return observations;
  return observations.filter((observation) => {
    const formattedDate = new Date(`${observation.serviceDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const haystack = [
      observation.id,
      observation.serviceDate,
      formattedDate,
      observation.meal,
      dishById(observation.dishId).name,
      observation.reaction,
      observation.severity,
      observation.status,
      observationStatusLabel(observation),
    ].join(" ").toLocaleLowerCase();
    return haystack.includes(needle);
  });
}
