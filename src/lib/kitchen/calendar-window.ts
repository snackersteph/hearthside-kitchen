import { addDays, addMonths, addWeeks, startOfWeek, subDays } from "date-fns";
import { dateKey, dayAt } from "./schedule";

/** The calendar always shows exactly four consecutive Monday–Sunday service weeks. */
export const CALENDAR_WINDOW_WEEKS = 4;
const WINDOW_DAYS = CALENDAR_WINDOW_WEEKS * 7;

/**
 * Four-week calendar window anchored on the current week, paged four weeks at a
 * time and kept inside the half-year-back / two-months-forward service range.
 */
export function calendarWindow(reference: Date, shift = 0) {
  const rangeStart = addMonths(dayAt(0, reference), -6);
  const rangeEnd = addMonths(dayAt(0, reference), 2);
  const monday = startOfWeek(reference, { weekStartsOn: 1 });
  const earliest = startOfWeek(rangeStart, { weekStartsOn: 1 });
  const latest = startOfWeek(subDays(rangeEnd, WINDOW_DAYS - 1), { weekStartsOn: 1 });
  const start = addWeeks(monday, shift * CALENDAR_WINDOW_WEEKS);
  const end = addDays(start, WINDOW_DAYS - 1);
  const weeks = Array.from({ length: CALENDAR_WINDOW_WEEKS }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => addDays(start, week * 7 + day)));
  return {
    start,
    end,
    weeks,
    dates: weeks.flat().map(dateKey),
    rangeStart,
    rangeEnd,
    canPrev: start > earliest,
    canNext: start < latest,
    caption: `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
  };
}
