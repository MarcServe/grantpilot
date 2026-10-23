/** Company registration age, distinct from trading duration. */
export function companyAgeYears(profile: { incorporationDate?: string | null; yearEstablished?: number | null }, now = new Date()): number | null {
  if (profile.incorporationDate) {
    const date = new Date(profile.incorporationDate);
    if (Number.isFinite(date.getTime()) && date <= now) {
      const birthdayPending = now.getUTCMonth() < date.getUTCMonth() ||
        (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() < date.getUTCDate());
      return now.getUTCFullYear() - date.getUTCFullYear() - (birthdayPending ? 1 : 0);
    }
  }
  const year = profile.yearEstablished;
  return typeof year === "number" && Number.isInteger(year) && year >= 1800 && year <= now.getUTCFullYear()
    ? now.getUTCFullYear() - year : null;
}
