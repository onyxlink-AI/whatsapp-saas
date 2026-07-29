import { describe, expect, it } from "vitest";
import { computeScheduledFor } from "./scheduling";

const MEXICO_CITY_WINDOW = {
  timezone: "America/Mexico_City",
  startMinute: 9 * 60, // 09:00
  endMinute: 20 * 60, // 20:00
};

describe("computeScheduledFor — deterministic offsets, no AI involved", () => {
  it("24 horas antes: cita a las 12:00, recordatorio cae exactamente 24h antes", () => {
    const appt = new Date("2026-08-10T12:00:00-06:00"); // CDMX, no DST
    const result = computeScheduledFor(appt, -24 * 60, MEXICO_CITY_WINDOW);
    expect(result.scheduledFor.toISOString()).toBe(
      new Date("2026-08-09T12:00:00-06:00").toISOString(),
    );
    expect(result.adjusted).toBe(false);
  });

  it("10 días después: seguimiento de evolución", () => {
    const appt = new Date("2026-08-01T10:00:00-06:00");
    const result = computeScheduledFor(appt, 10 * 24 * 60, MEXICO_CITY_WINDOW);
    expect(result.scheduledFor.toISOString()).toBe(
      new Date("2026-08-11T10:00:00-06:00").toISOString(),
    );
    expect(result.adjusted).toBe(false);
  });

  it("28 días después: revisión final", () => {
    const appt = new Date("2026-08-01T10:00:00-06:00");
    const result = computeScheduledFor(appt, 28 * 24 * 60, MEXICO_CITY_WINDOW);
    expect(result.scheduledFor.toISOString()).toBe(
      new Date("2026-08-29T10:00:00-06:00").toISOString(),
    );
  });
});

describe("computeScheduledFor — horario permitido", () => {
  it("desplaza al inicio del horario permitido si el cálculo cae de madrugada", () => {
    // Appointment at 08:30, reminder "1 day after" would land at 08:30 too —
    // instead pick an offset that lands outside the window: 2h after a 01:00 appt.
    const appt = new Date("2026-08-10T01:00:00-06:00");
    const result = computeScheduledFor(appt, 2 * 60, MEXICO_CITY_WINDOW); // -> 03:00
    expect(result.adjusted).toBe(true);
    expect(result.reason).toBe("fuera_de_horario_permitido");
    // Same local day, moved forward to the window start (09:00).
    const local = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Mexico_City",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    }).format(result.scheduledFor);
    expect(local).toBe("09:00");
  });

  it("desplaza al día siguiente si el cálculo cae después del horario permitido", () => {
    const appt = new Date("2026-08-10T20:30:00-06:00");
    const result = computeScheduledFor(appt, 60, MEXICO_CITY_WINDOW); // -> 21:30, after window end (20:00)
    expect(result.adjusted).toBe(true);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Mexico_City",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(result.scheduledFor);
    const get = (t: string) => parts.find((p) => p.type === t)?.value;
    expect(`${get("year")}-${get("month")}-${get("day")}`).toBe("2026-08-11");
    expect(`${get("hour")}:${get("minute")}`).toBe("09:00");
  });

  it("no ajusta cuando cae exactamente en el límite del horario (09:00)", () => {
    const appt = new Date("2026-08-10T09:00:00-06:00");
    const result = computeScheduledFor(appt, 0, MEXICO_CITY_WINDOW);
    expect(result.adjusted).toBe(false);
  });
});

describe("computeScheduledFor — cambio de horario de verano (America/New_York, 2026)", () => {
  // DST starts 2026-03-08 at 02:00 local (clocks spring forward to 03:00),
  // so 2026-03-08 has only 23 real hours. A correct "24 hours before" must
  // do fixed-duration arithmetic, NOT naive "same wall-clock time, minus one
  // calendar day" — those two give DIFFERENT answers across this boundary.
  const NY_WINDOW = {
    timezone: "America/New_York",
    startMinute: 9 * 60,
    endMinute: 20 * 60,
  };

  it("24 horas antes de una cita justo después del cambio de horario cae 1h más temprano en reloj local", () => {
    // 2026-03-08T10:00 local is EDT (UTC-4) — after the 03:00 spring-forward.
    const appt = new Date("2026-03-08T10:00:00-04:00");
    const result = computeScheduledFor(appt, -24 * 60, NY_WINDOW);

    // Fixed 24h earlier in absolute time lands on 2026-03-07, which is still
    // EST (UTC-5) — so the correct local wall-clock time is 09:00, not 10:00.
    // (A naive calendar-day shift would wrongly produce 10:00.)
    const local = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(result.scheduledFor);
    const get = (t: string) => local.find((p) => p.type === t)?.value;
    expect(`${get("year")}-${get("month")}-${get("day")}`).toBe("2026-03-07");
    expect(`${get("hour")}:${get("minute")}`).toBe("09:00");
    expect(result.adjusted).toBe(false);
    // Exactly 24 real hours elapsed, confirming this is duration arithmetic.
    expect(appt.getTime() - result.scheduledFor.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("24 horas antes, cruzando el fin del horario de verano (fall-back), cae 1h más tarde en reloj local", () => {
    // DST ends 2026-11-01 at 02:00 local (clocks fall back to 01:00) — the
    // instant of the transition is 06:00 UTC. Pick an appointment whose
    // "24h before" instant falls BEFORE that transition while the
    // appointment itself falls AFTER it, so the wall-clock hour must shift.
    // Uses an all-day window (0-1439) to isolate the raw offset math from
    // the separate "allowed send window" shift-forward behavior tested above.
    const OPEN_WINDOW = { timezone: "America/New_York", startMinute: 0, endMinute: 1439 };
    const appt = new Date("2026-11-02T00:30:00-05:00"); // just after midnight, already EST
    const result = computeScheduledFor(appt, -24 * 60, OPEN_WINDOW);

    const local = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(result.scheduledFor);
    const get = (t: string) => local.find((p) => p.type === t)?.value;
    // The repeated 1-2am hour on Nov 1 means 24h before 00:30 (EST) lands at
    // 01:30 (still EDT, pre-transition) — one hour later on the clock, not
    // the same wall-clock time a calendar day back.
    expect(`${get("year")}-${get("month")}-${get("day")}`).toBe("2026-11-01");
    expect(`${get("hour")}:${get("minute")}`).toBe("01:30");
    expect(appt.getTime() - result.scheduledFor.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});
