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
export function getHourInTimezone(timezone: string, date = new Date()): number {
  try {
    const s = date.toLocaleString("en-GB", {
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

/** Return true if "today" is Monday in the given IANA timezone (for weekly cron logic per org). */
export function isMondayLocal(timezone: string): boolean {
  try {
    const weekday = new Date().toLocaleDateString("en-GB", {
      timeZone: timezone || "UTC",
      weekday: "long",
    });
    return weekday === "Monday";
  } catch {
    return false;
  }
}

export function isEligibilityNotificationTime(timezone: string, date = new Date()): boolean {
  return getHourInTimezone(timezone || "UTC", date) === 8;
}

/**
 * Return true during the daytime digest delivery window.
 * The first run at 08:30 local is preferred; later hourly runs provide
 * same-day recovery when a scheduler invocation is missed.
 */
export function isEligibilityNotificationCatchUpTime(timezone: string, date = new Date()): boolean {
  const hour = getHourInTimezone(timezone || "UTC", date);
  return hour >= 8 && hour < 18;
}
