/**
 * True when `tz` is a real IANA timezone identifier (e.g. "Europe/Madrid").
 * Guards against free-text descriptions ("Zona horaria de Madrid (GMT+2)")
 * that pass validation as non-empty strings but crash Intl.DateTimeFormat
 * at runtime — see Issue 3 in _onyxlink-handoff/10-ISSUES_AND_FIXES.md.
 */
export function isValidIanaTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
