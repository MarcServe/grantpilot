/** Retry only recoverable terminal work, after a cooldown; never steal live work. */
export function shouldRecoverDeepScore(row: {status: string | null; last_error?: string | null; updated_at?: string | null}, assessmentSource: string | null | undefined, now = Date.now()): boolean {
  const updated = Date.parse(row.updated_at ?? "");
  if (!Number.isFinite(updated) || now - updated < 24 * 60 * 60 * 1000) return false;
  if (row.status === "completed") return ["heuristic", "embedding"].includes(assessmentSource ?? "");
  if (row.status === "skipped") return /profile is incomplete|trial is inactive|monthly match quota/i.test(row.last_error ?? "");
  return false;
}
