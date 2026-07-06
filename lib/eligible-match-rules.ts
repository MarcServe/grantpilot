export type ActiveMatchSection = "suggested" | "within_reach" | "other";
export type EligibleMatchSection = ActiveMatchSection | "needs_review" | "reviewed";
export type GrantUserState = "saved" | "viewed" | "deferred" | "applied" | "dismissed";

export type SortableEligibleMatch = {
  score: number;
  addedAt?: string | null;
  scoredAt?: string | null;
  grantName?: string | null;
};

const SUPPRESSED_ACTIVE_STATES = new Set<GrantUserState>(["viewed", "deferred", "applied", "dismissed"]);

export function normalizeEligibleMatchSection(raw: string | null | undefined): EligibleMatchSection {
  if (
    raw === "suggested" ||
    raw === "within_reach" ||
    raw === "other" ||
    raw === "needs_review" ||
    raw === "reviewed"
  ) {
    return raw;
  }
  return "suggested";
}

export function optionalEligibleMatchSection(raw: string | null | undefined): EligibleMatchSection | null {
  if (
    raw === "suggested" ||
    raw === "within_reach" ||
    raw === "other" ||
    raw === "needs_review" ||
    raw === "reviewed"
  ) {
    return raw;
  }
  return null;
}

export function activeSectionForScore(score: number): ActiveMatchSection {
  if (score >= 85) return "suggested";
  if (score >= 50) return "within_reach";
  return "other";
}

export function isTrustedMatchScoringSource(scoringSource?: string | null): boolean {
  return scoringSource === "openai" || scoringSource === "intelligence";
}

export function isHeuristicMatchScoringSource(scoringSource?: string | null): boolean {
  return !isTrustedMatchScoringSource(scoringSource);
}

export function scoreBelongsToMatchSection(section: EligibleMatchSection, score: number): boolean {
  if (!Number.isFinite(score) || score < 1) return false;
  if (section === "needs_review" || section === "reviewed") return true;
  return activeSectionForScore(score) === section;
}

export function matchSectionAllowsCandidate(params: {
  section: EligibleMatchSection;
  userState?: GrantUserState | null;
  scoringSource?: string | null;
}): boolean {
  const { section, userState, scoringSource } = params;
  if (userState === "deferred" || userState === "applied" || userState === "dismissed") return false;
  if (section === "reviewed") return userState === "viewed";
  if (userState && SUPPRESSED_ACTIVE_STATES.has(userState)) return false;
  if (section === "needs_review") return isHeuristicMatchScoringSource(scoringSource);
  return isTrustedMatchScoringSource(scoringSource);
}

function dateTime(value?: string | null): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sortEligibleMatchesForSection(
  section: EligibleMatchSection,
  a: SortableEligibleMatch,
  b: SortableEligibleMatch
): number {
  if (section === "suggested") {
    if (b.score !== a.score) return b.score - a.score;
  }

  const addedDelta = dateTime(b.addedAt) - dateTime(a.addedAt);
  if (addedDelta !== 0) return addedDelta;
  if (b.score !== a.score) return b.score - a.score;
  const scoredDelta = dateTime(b.scoredAt) - dateTime(a.scoredAt);
  if (scoredDelta !== 0) return scoredDelta;
  return (a.grantName ?? "").localeCompare(b.grantName ?? "");
}
