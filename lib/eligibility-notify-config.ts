/**
 * Minimum BusinessProfile.completionScore before eligibility digest / WhatsApp alerts are sent.
 * Scoring and EligibilityAssessment upserts still run for all org-linked profiles.
 *
 * Default: 30% — low enough that early profiles still get notifications.
 * Override with ELIGIBILITY_NOTIFY_MIN_COMPLETION (0–100), e.g. "50" or "70".
 */
export function getEligibilityNotifyMinCompletion(): number {
  const raw = (process.env.ELIGIBILITY_NOTIFY_MIN_COMPLETION ?? "30").trim();
  const n = Number(raw);
  if (!Number.isFinite(n)) return 30;
  return Math.min(100, Math.max(0, Math.round(n)));
}
