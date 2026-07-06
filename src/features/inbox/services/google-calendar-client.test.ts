import { describe, it, expect } from "vitest";
import {
  computeFreeSlots,
  type BusyPeriod,
  type GoogleCalendarConfig,
} from "./google-calendar-client";

const cfg: GoogleCalendarConfig = {
  calendarId: "test@example.com",
  timezone: "Europe/Madrid",
  businessHoursStart: 9,
  businessHoursEnd: 18,
  slotMinutes: 30,
};

// Well before business hours on 2026-07-06, so every slot that day is "future".
const BEFORE_DAY = new Date("2026-07-06T00:00:00Z").getTime();

describe("computeFreeSlots", () => {
  it("generates every 30-min slot within business hours for a single day with no busy periods", () => {
    const slots = computeFreeSlots(cfg, "2026-07-06", "2026-07-06", [], BEFORE_DAY);
    // 9:00 to 17:30 inclusive, every 30 min = 18 slots.
    expect(slots).toHaveLength(18);
    expect(slots[0]).toBe("2026-07-06T07:00:00.000Z"); // 09:00 CEST (+02:00)
    expect(slots.at(-1)).toBe("2026-07-06T15:30:00.000Z"); // 17:30 CEST
  });

  it("excludes slots that have already passed", () => {
    // "now" = 11:00 Madrid time (09:00Z) — the 11:00 slot itself and everything
    // before it should be gone; 11:30 onward should remain.
    const now = new Date("2026-07-06T09:00:00.000Z").getTime();
    const slots = computeFreeSlots(cfg, "2026-07-06", "2026-07-06", [], now);
    expect(slots).not.toContain("2026-07-06T09:00:00.000Z"); // 11:00 local
    expect(slots[0]).toBe("2026-07-06T09:30:00.000Z"); // 11:30 local, first future slot
  });

  it("excludes slots that overlap a busy period", () => {
    // Busy 12:00–13:00 Madrid time = 10:00–11:00Z.
    const busy: BusyPeriod[] = [
      { start: "2026-07-06T10:00:00.000Z", end: "2026-07-06T11:00:00.000Z" },
    ];
    const slots = computeFreeSlots(cfg, "2026-07-06", "2026-07-06", busy, BEFORE_DAY);
    expect(slots).not.toContain("2026-07-06T10:00:00.000Z"); // 12:00 local
    expect(slots).not.toContain("2026-07-06T10:30:00.000Z"); // 12:30 local
    expect(slots).toContain("2026-07-06T11:00:00.000Z"); // 13:00 local, right after busy ends
  });

  it("caps at 30 slots total, spanning into the next day", () => {
    const slots = computeFreeSlots(cfg, "2026-07-06", "2026-07-08", [], BEFORE_DAY);
    expect(slots).toHaveLength(30);
    // Slot #30 is the 12th slot of day 2 (18 from day 1 + 12 from day 2) = 14:30 local.
    expect(slots.at(-1)).toBe("2026-07-07T12:30:00.000Z");
    // The next slot (15:00 local day 2) must NOT be present — this is the cap.
    expect(slots).not.toContain("2026-07-07T13:00:00.000Z");
    // Day 3 must not be reached at all.
    expect(slots.some((s) => s.startsWith("2026-07-08"))).toBe(false);
  });
});
