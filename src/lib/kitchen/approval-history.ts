import type { Decision } from "./types";

export type HistoryRange = 7 | 14 | 30 | "all";

/** History periods use the recorded decision time, never the meal/order service dates. */
export function approvalHistory(history: Decision[], range: HistoryRange, reference: Date, kind: Decision["kind"] | "all" = "all", query = ""): Decision[] {
  const now = reference.getTime();
  const start = range === "all" ? -Infinity : now - range * 86400000;
  const search = query.trim().toLowerCase();
  return history.filter((decision) => Number.isFinite(decision.at) && decision.at >= start && decision.at <= now
    && (kind === "all" || decision.kind === kind)
    && (!search || `${decision.summary} ${decision.serviceDate ?? ""} ${decision.serviceWeekId ?? ""}`.toLowerCase().includes(search)))
    .sort((a, b) => b.at - a.at);
}