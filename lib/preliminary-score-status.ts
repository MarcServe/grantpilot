import { getGrantFreshnessStatus, type GrantFreshnessInput } from './grant-freshness';
export function preliminaryScoreStatus(grant: GrantFreshnessInput, score?: number): string {
  const freshness = getGrantFreshnessStatus(grant);
  if (!freshness.usable) return freshness.message ?? 'Not queued: opportunity unavailable';
  if (score != null && score < 40) return 'Low preliminary fit — full AI assessment not confirmed';
  return 'Preliminary fit — full AI assessment not confirmed';
}
