/**
 * Pure planner for the one-off grant data-quality cleanup.
 *
 * Nothing is deleted and no foreign keys are repointed. Each planned action is a
 * single-row UPDATE of Grant link/status columns, with the previous values kept
 * so it can be rolled back:
 *
 * - fix_ifs_links: point Innovate UK IFS links at the competition IFS lists.
 * - retire: set url_status = 'expired' so the row drops out of every list and
 *   match. The daily URL sweep leaves 'expired' rows expired (it only tries
 *   URL recovery on 'dead'), so this sticks until someone reverts it.
 *
 * Retired: rows with a data-quality issue, AI-found Innovate UK "competitions"
 * that IFS does not list, and every duplicate except the strongest row of its
 * cluster. Applications and assessments keep pointing at their row.
 */

import { classifyGrantApplicationUrl } from "@/lib/grant-application-url-quality";
import {
  getGrantDataQualityIssue,
  grantIdentityKey,
  grantRecordStrength,
  isSameGrantIdentity,
} from "@/lib/grant-data-quality";
import {
  isIfsUrl,
  isUnlistedInnovateUkCompetition,
  reconcileIfsCompetitionUrls,
  type IfsCompetitionIndex,
} from "@/lib/ifs-competitions";
import { isPastGrantDeadline } from "@/lib/grant-freshness";

export type CleanupGrantRow = {
  id: string;
  name: string;
  funder: string;
  deadline: string | null;
  applicationUrl: string;
  detailUrl: string | null;
  directApplicationUrl: string | null;
  applicationUrlKind?: string | null;
  applicationUrlQuality: string | null;
  applicationUrlConfidence?: number | null;
  applicationUrlQualityReason?: string | null;
  source: string | null;
  url_status: string | null;
  createdAt: string | null;
};

/** Columns the cleanup may change; used for the before-snapshot and rollback. */
export const CLEANUP_COLUMNS = [
  "applicationUrl",
  "detailUrl",
  "directApplicationUrl",
  "deadline",
  "applicationUrlKind",
  "applicationUrlQuality",
  "applicationUrlConfidence",
  "applicationUrlQualityReason",
  "url_status",
] as const;
export type CleanupColumn = (typeof CLEANUP_COLUMNS)[number];
export type CleanupValues = Partial<Record<CleanupColumn, string | number | null>>;

export type CleanupReason =
  | "ifs_link_fix"
  | "ifs_not_listed"
  | "duplicate"
  | "listing_page"
  | "aggregator_only"
  | "title_year_passed"
  | "source_unverified";

export type CleanupAction = {
  id: string;
  name: string;
  action: "fix_ifs_links" | "retire";
  reason: CleanupReason;
  detail: string;
  before: CleanupValues;
  after: CleanupValues;
};

export type CleanupPlan = {
  generatedAt: string;
  scopeRows: number;
  ifsIndexLoaded: boolean;
  actions: CleanupAction[];
};

export function isSurfaceableNow(g: Pick<CleanupGrantRow, "deadline" | "url_status">, now = new Date()): boolean {
  return !isPastGrantDeadline(g.deadline, now) && g.url_status !== "dead" && g.url_status !== "expired";
}

function snapshot(g: CleanupGrantRow, columns: readonly CleanupColumn[]): CleanupValues {
  const out: CleanupValues = {};
  for (const c of columns) out[c] = (g[c as keyof CleanupGrantRow] as string | number | null | undefined) ?? null;
  return out;
}

export function buildGrantCleanupPlan(rows: CleanupGrantRow[], ifsIndex: IfsCompetitionIndex | null, now = new Date()): CleanupPlan {
  const scope = rows.filter((g) => isSurfaceableNow(g, now));
  const view = new Map<string, CleanupGrantRow>();
  const ifsChanges = new Map<string, string[]>();
  const retire = new Map<string, { reason: CleanupReason; detail: string }>();

  // 1. IFS link corrections (and IFS-unlisted Innovate UK records).
  for (const g of scope) {
    if (!ifsIndex) break;
    const touches = [g.applicationUrl, g.detailUrl, g.directApplicationUrl].some(isIfsUrl)
      || /innovate uk|ukri/i.test(`${g.funder} ${g.name}`);
    if (!touches) continue;
    const { grant, changes } = reconcileIfsCompetitionUrls(g, ifsIndex);
    if (changes.length) {
      view.set(g.id, grant);
      ifsChanges.set(g.id, changes);
    }
    if (!grant.applicationUrl?.trim()) {
      retire.set(g.id, { reason: "ifs_link_fix", detail: "No link left after removing unlisted IFS competition URLs" });
    } else if (isUnlistedInnovateUkCompetition(grant, ifsIndex)) {
      retire.set(g.id, { reason: "ifs_not_listed", detail: "AI-found Innovate UK competition, not listed on IFS, no deadline" });
    }
  }
  const current = (g: CleanupGrantRow) => view.get(g.id) ?? g;

  // 2. Record-level data-quality issues.
  for (const g of scope) {
    if (retire.has(g.id)) continue;
    const issue = getGrantDataQualityIssue(current(g), now);
    if (issue) retire.set(g.id, { reason: issue.code, detail: issue.message });
  }

  // 3. Duplicates among the rows that stay: keep the strongest, retire the rest.
  const byKey = new Map<string, CleanupGrantRow[]>();
  for (const g of scope) {
    if (retire.has(g.id)) continue;
    const key = grantIdentityKey(g);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(g);
  }
  const rank = (a: CleanupGrantRow, b: CleanupGrantRow) =>
    grantRecordStrength(current(b)) - grantRecordStrength(current(a))
    || String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const remaining = [...group].sort(rank);
    while (remaining.length) {
      const keeper = remaining.shift()!;
      for (let i = remaining.length - 1; i >= 0; i--) {
        if (isSameGrantIdentity(current(keeper), current(remaining[i]))) {
          const dup = remaining.splice(i, 1)[0];
          retire.set(dup.id, { reason: "duplicate", detail: `Duplicate of ${keeper.id} ("${keeper.name}")` });
        }
      }
    }
  }

  // 4. Build actions. A retired row only gets its status changed.
  const actions: CleanupAction[] = [];
  for (const g of scope) {
    const r = retire.get(g.id);
    if (r) {
      actions.push({
        id: g.id, name: g.name, action: "retire", reason: r.reason, detail: r.detail,
        before: snapshot(g, ["url_status"]), after: { url_status: "expired" },
      });
      continue;
    }
    const fixed = view.get(g.id);
    if (!fixed) continue;
    const classification = classifyGrantApplicationUrl(fixed.applicationUrl);
    const after: CleanupValues = {
      applicationUrl: fixed.applicationUrl,
      detailUrl: fixed.detailUrl ?? null,
      directApplicationUrl: fixed.directApplicationUrl ?? null,
      deadline: fixed.deadline ?? null,
      applicationUrlKind: classification.kind,
      applicationUrlQuality: classification.quality,
      applicationUrlConfidence: classification.confidence,
      applicationUrlQualityReason: classification.reason,
      url_status: "unknown", // let the daily sweep re-check the new link
    };
    const before = snapshot(g, CLEANUP_COLUMNS);
    for (const c of CLEANUP_COLUMNS) if (before[c] === after[c]) delete after[c];
    if (Object.keys(after).length === 0) continue;
    for (const c of Object.keys(before) as CleanupColumn[]) if (!(c in after)) delete before[c];
    actions.push({
      id: g.id, name: g.name, action: "fix_ifs_links", reason: "ifs_link_fix",
      detail: (ifsChanges.get(g.id) ?? []).join("; "), before, after,
    });
  }

  return { generatedAt: now.toISOString(), scopeRows: scope.length, ifsIndexLoaded: !!ifsIndex, actions };
}
