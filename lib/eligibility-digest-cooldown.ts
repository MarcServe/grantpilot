function positiveIntFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export const DIGEST_GRANT_REPEAT_COOLDOWN_DAYS = positiveIntFromEnv(
  "ELIGIBILITY_DIGEST_GRANT_REPEAT_COOLDOWN_DAYS",
  7
);

export function isOutsideDigestGrantRepeatCooldown(
  notifiedAt: string | null | undefined,
  now = new Date()
): boolean {
  if (!notifiedAt) return true;
  const notifiedAtTime = new Date(notifiedAt).getTime();
  if (!Number.isFinite(notifiedAtTime)) return true;
  return notifiedAtTime < now.getTime() - DIGEST_GRANT_REPEAT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
}
