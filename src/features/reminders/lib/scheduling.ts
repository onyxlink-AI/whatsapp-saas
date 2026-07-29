// Pure date math for the reminders engine — no DB, no fetch. This is what
// decides exactly when a step goes out; the AI never computes or chooses a
// date. Kept pure and dependency-free (native Intl only, same technique
// business-info.ts's buildNowContext already uses) so it's fully unit-testable,
// including DST transitions.

export interface SendWindow {
  timezone: string;
  /** Minutes since local midnight (0-1439). */
  startMinute: number;
  /** Minutes since local midnight (0-1439). */
  endMinute: number;
}

export interface ComputedSchedule {
  scheduledFor: Date;
  /** True when the raw offset landed outside the allowed window and had to move. */
  adjusted: boolean;
  reason?: string;
}

interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}

/** What wall-clock time does this UTC instant represent in `timeZone`? */
function getLocalParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/**
 * Converts local wall-clock parts (as observed in `timeZone`) to the UTC
 * instant they represent. Two-pass convergence: since a timezone's UTC
 * offset only ever shifts by a couple of hours around a DST transition,
 * correcting the guess twice is enough to land exactly (same technique
 * libraries like date-fns-tz use internally) — this is what makes window
 * enforcement correct across a spring-forward/fall-back boundary.
 */
function localPartsToUtc(parts: LocalParts, timeZone: string): Date {
  let guess = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute),
  );
  for (let i = 0; i < 2; i++) {
    const observed = getLocalParts(guess, timeZone);
    const wantedMs = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
    );
    const observedMs = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
    );
    const diffMs = wantedMs - observedMs;
    if (diffMs === 0) break;
    guess = new Date(guess.getTime() + diffMs);
  }
  return guess;
}

function minuteOfDay(parts: LocalParts): number {
  return parts.hour * 60 + parts.minute;
}

/**
 * Computes the exact instant a reminder step should fire, given the
 * appointment's absolute scheduled time and a signed minute offset
 * (negative = before the appointment, positive = after).
 *
 * `offsetMinutes` is a fixed duration, so it's applied directly to the UTC
 * instant (DST doesn't affect elapsed-duration arithmetic). What DST DOES
 * affect is whether that instant falls inside the workspace's local send
 * window — that check (and the shift-forward when it doesn't) is done via
 * `Intl`-based local-time conversion, so it's correct across a DST
 * transition between the appointment and the computed send time.
 */
export function computeScheduledFor(
  appointmentScheduledAt: Date,
  offsetMinutes: number,
  window: SendWindow,
): ComputedSchedule {
  const raw = new Date(appointmentScheduledAt.getTime() + offsetMinutes * 60_000);
  const localRaw = getLocalParts(raw, window.timezone);
  const rawMinuteOfDay = minuteOfDay(localRaw);

  if (rawMinuteOfDay >= window.startMinute && rawMinuteOfDay <= window.endMinute) {
    return { scheduledFor: raw, adjusted: false };
  }

  // Outside the allowed window — move to the next allowed instant: today's
  // window start if we're still before it, otherwise tomorrow's window start.
  const movesToNextDay = rawMinuteOfDay > window.endMinute;
  const targetDay = movesToNextDay
    ? new Date(Date.UTC(localRaw.year, localRaw.month - 1, localRaw.day + 1))
    : new Date(Date.UTC(localRaw.year, localRaw.month - 1, localRaw.day));
  const targetDayParts = getLocalParts(targetDay, "UTC"); // just to read back y/m/d cleanly after +1 day rollover

  const target = localPartsToUtc(
    {
      year: targetDayParts.year,
      month: targetDayParts.month,
      day: targetDayParts.day,
      hour: Math.floor(window.startMinute / 60),
      minute: window.startMinute % 60,
    },
    window.timezone,
  );

  return {
    scheduledFor: target,
    adjusted: true,
    reason: "fuera_de_horario_permitido",
  };
}

/**
 * Adjusts an arbitrary candidate instant (not tied to an appointment) to
 * fall inside the allowed send window — reused by the daily-limit and
 * minimum-separation reprogramming logic in reminder-sender.ts so "push
 * this to tomorrow" / "push this back N minutes" always lands on an
 * actually-allowed instant, via the exact same DST-correct logic as
 * computeScheduledFor (implemented as offsetMinutes=0 against that instant —
 * no duplicated window math).
 */
export function adjustToAllowedWindow(candidate: Date, window: SendWindow): ComputedSchedule {
  return computeScheduledFor(candidate, 0, window);
}

/** Midnight (00:00) of the given instant's local calendar day, in `timeZone`. */
export function startOfLocalDay(instant: Date, timeZone: string): Date {
  const parts = getLocalParts(instant, timeZone);
  return localPartsToUtc({ ...parts, hour: 0, minute: 0 }, timeZone);
}
