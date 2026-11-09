import type { Resident } from "./types";

export function residentNames(r: Resident) {
  const [firstName = "", ...rest] = r.name.trim().split(/\s+/);
  return { firstName, lastName: rest.join(" ") };
}

export function medicalConditions(r: Resident) {
  return r.careProfile?.["Medical Conditions"] ?? r.notes.split("\n").find((line) => line.startsWith("Medical conditions:"))?.slice("Medical conditions:".length).trim() ?? "Not specified";
}

export function compareByFirstName(a: Resident, b: Resident) {
  return residentNames(a).firstName.localeCompare(residentNames(b).firstName, undefined, { sensitivity: "base" }) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}
