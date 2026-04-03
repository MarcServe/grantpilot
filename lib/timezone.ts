export const VALID_TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Australia/Sydney",
] as const;

/**
 * Return the current hour (0-23) in the given IANA timezone.
 * Uses Intl; invalid tz falls back to UTC.
 */
export function getHourInTimezone(timezone: string): number {
  try {
    const s = new Date().toLocaleString("en-GB", {
      timeZone: timezone || "UTC",
      hour: "numeric",
      hour12: false,
    });
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? 12 : n;
  } catch {
    return 12;
  }
}

/** Return true if it's 9am (9:00–9:59) in the given timezone. */
export function isNineAmLocal(timezone: string): boolean {
  return getHourInTimezone(timezone || "UTC") === 9;
}

/** Return true if it's 8am (8:00–8:59) in the given timezone.
 *  Cron runs at :30 past each hour, so hour=8 means it's ~8:30 AM local. */
export function isEligibilityNotificationTime(timezone: string): boolean {
  return getHourInTimezone(timezone || "UTC") === 8;
}
