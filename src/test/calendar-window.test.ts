import { describe, expect, it } from "vitest";
import { addDays, startOfWeek } from "date-fns";
import { CALENDAR_WINDOW_WEEKS, calendarWindow } from "@/lib/kitchen/calendar-window";
import { dateKey } from "@/lib/kitchen/schedule";

// Thursday Nov 12, 2026 sits inside service week Mon Nov 9 – Sun Nov 15, 2026.
const reference = new Date(2026, 10, 12);

describe("calendar window", () => {
  it("shows exactly four Monday–Sunday weeks starting with the current week", () => {
    const view = calendarWindow(reference);
    expect(view.weeks).toHaveLength(CALENDAR_WINDOW_WEEKS);
    expect(view.dates).toHaveLength(CALENDAR_WINDOW_WEEKS * 7);
    expect(new Set(view.dates).size).toBe(CALENDAR_WINDOW_WEEKS * 7);
    expect(dateKey(view.start)).toBe("2026-11-09");
    expect(startOfWeek(view.start, { weekStartsOn: 1 })).toEqual(view.start);
    expect(dateKey(view.end)).toBe("2026-12-06");
    expect(view.dates[0]).toBe("2026-11-09");
    expect(view.dates.at(-1)).toBe("2026-12-06");
    // Every row is a full Mon–Sun week with no days from neighbouring weeks.
    for (const week of view.weeks) {
      expect(week).toHaveLength(7);
      const [monday] = week;
      const sunday = week.at(-1);
      expect(monday).toBeDefined();
      expect(sunday).toBeDefined();
      expect(monday!.getDay()).toBe(1);
      expect(sunday!.getDay()).toBe(0);
      expect(dateKey(sunday!)).toBe(dateKey(addDays(monday!, 6)));
    }
  });

  it("pages four weeks at a time and stops at the service range bounds", () => {
    const current = calendarWindow(reference);
    const next = calendarWindow(reference, 1);
    expect(dateKey(next.start)).toBe("2026-12-07");
    expect(next.canNext).toBe(true);
    expect(current.canPrev).toBe(true);
    // Stepping back four weeks at a time eventually leaves the half-year range.
    let shift = 0;
    while (calendarWindow(reference, shift).canPrev) shift -= 1;
    const earliest = calendarWindow(reference, shift);
    expect(earliest.canPrev).toBe(false);
    expect(earliest.start >= earliest.rangeStart || dateKey(earliest.start) >= dateKey(addDays(earliest.rangeStart, -7))).toBe(true);
    shift = 0;
    while (calendarWindow(reference, shift).canNext) shift += 1;
    const latest = calendarWindow(reference, shift);
    expect(latest.canNext).toBe(false);
    expect(latest.end <= latest.rangeEnd).toBe(true);
  });

  it("labels the window with its first and last date", () => {
    expect(calendarWindow(reference).caption).toBe("Nov 9 – Dec 6, 2026");
  });
});
