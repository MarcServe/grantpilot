/**
 * Innovate UK Innovation Funding Service (IFS) competition index.
 *
 * AI discovery providers regularly return IFS URLs with the wrong competition id
 * (e.g. /competition/2585/overview/<uuid of another competition>). IFS answers
 * those with 403, and because every IFS host URL used to be classified as a
 * verified portal, the bad link was shown as the official application route.
 *
 * The public competition search page lists every open and upcoming competition
 * with its canonical /competition/{id}/overview/{uuid} link, so it is the source
 * of truth: an IFS competition URL is only kept when it appears there, and a
 * candidate whose title matches a listed competition is pointed at that link.
 */

import { normalizeGrantTextKey } from "@/lib/grant-candidate-quality";

export const IFS_HOST = "apply-for-innovation-funding.service.gov.uk";
export const IFS_SEARCH_URL = `https://${IFS_HOST}/competition/search`;

export type IfsCompetition = {
  id: string;
  uuid: string;
  title: string;
  url: string;
  closes: string | null; // ISO date (yyyy-mm-dd)
};

export type IfsCompetitionIndex = {
  byId: Map<string, IfsCompetition>;
  competitions: IfsCompetition[];
};

export function isIfsUrl(raw?: string | null): boolean {
  try {
    return new URL(String(raw ?? "").trim()).hostname.toLowerCase() === IFS_HOST;
  } catch {
    return false;
  }
}

export function parseIfsCompetitionUrl(raw?: string | null): { id: string; uuid: string | null } | null {
  if (!isIfsUrl(raw)) return null;
  const match = new URL(String(raw).trim()).pathname.match(/^\/competition\/(\d+)(?:\/overview(?:\/([0-9a-f-]{36}))?)?\/?/i);
  if (!match) return null;
  return { id: match[1], uuid: match[2]?.toLowerCase() ?? null };
}

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function parseIfsDate(text: string): string | null {
  const m = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})/);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (month == null) return null;
  return new Date(Date.UTC(Number(m[3]), month, Number(m[1]))).toISOString().slice(0, 10);
}

/** Parse the IFS competition search HTML into competitions. Pure; exported for tests. */
export function parseIfsCompetitionSearchHtml(html: string): IfsCompetition[] {
  const anchor = /href="\/competition\/(\d+)\/overview\/([0-9a-f-]{36})"[^>]*>([^<]+)</gi;
  const hits = [...html.matchAll(anchor)];
  const out: IfsCompetition[] = [];
  hits.forEach((hit, i) => {
    const id = hit[1];
    const uuid = hit[2].toLowerCase();
    const title = hit[3].replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, " ").trim();
    const block = html.slice(hit.index ?? 0, hits[i + 1]?.index ?? html.length).replace(/<[^>]+>/g, " ");
    const closesMatch = block.match(/Closes:\s*([^\n]{0,40})/i);
    out.push({
      id,
      uuid,
      title,
      url: `https://${IFS_HOST}/competition/${id}/overview/${uuid}`,
      closes: closesMatch ? parseIfsDate(closesMatch[1]) : null,
    });
  });
  return out;
}

export function buildIfsCompetitionIndex(competitions: IfsCompetition[]): IfsCompetitionIndex {
  const byId = new Map<string, IfsCompetition>();
  for (const c of competitions) if (!byId.has(c.id)) byId.set(c.id, c);
  return { byId, competitions: [...byId.values()] };
}

const CACHE_MS = 6 * 60 * 60 * 1000;
let cached: { at: number; index: IfsCompetitionIndex } | null = null;

/**
 * Fetch the live IFS index (open + upcoming competitions). Returns null when IFS
 * cannot be reached, so callers fail open rather than discarding every grant.
 */
export async function loadIfsCompetitionIndex(options?: { fetchImpl?: typeof fetch; force?: boolean }): Promise<IfsCompetitionIndex | null> {
  if (!options?.force && cached && Date.now() - cached.at < CACHE_MS) return cached.index;
  const doFetch = options?.fetchImpl ?? fetch;
  const all: IfsCompetition[] = [];
  try {
    for (let page = 0; page < 10; page++) {
      const url = page === 0 ? IFS_SEARCH_URL : `${IFS_SEARCH_URL}?page=${page}`;
      const res = await doFetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; GrantsCopilot/1.0)", Accept: "text/html" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        if (page === 0) return null;
        break;
      }
      const found = parseIfsCompetitionSearchHtml(await res.text());
      const fresh = found.filter((c) => !all.some((x) => x.id === c.id));
      if (fresh.length === 0) break;
      all.push(...fresh);
    }
  } catch (error) {
    console.warn("[ifs-competitions] index fetch failed", error);
    return null;
  }
  if (all.length === 0) return null;
  const index = buildIfsCompetitionIndex(all);
  cached = { at: Date.now(), index };
  return index;
}

function titleTokens(value: string): string[] {
  return normalizeGrantTextKey(value)
    .replace(/\b(innovate uk|ukri|uk research and innovation)\b/g, " ")
    .split(" ")
    .filter(Boolean);
}

/** Find the listed competition whose title matches the candidate name, if exactly one fits. */
export function matchIfsCompetitionByTitle(name: string, index: IfsCompetitionIndex): IfsCompetition | null {
  const wanted = titleTokens(name);
  if (wanted.length === 0) return null;
  const wantedKey = wanted.join(" ");
  const exact = index.competitions.filter((c) => titleTokens(c.title).join(" ") === wantedKey);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  const wantedSet = new Set(wanted);
  const scored = index.competitions
    .map((c) => {
      const tokens = new Set(titleTokens(c.title));
      const inter = [...tokens].filter((t) => wantedSet.has(t)).length;
      const union = new Set([...tokens, ...wantedSet]).size;
      return { c, score: union ? inter / union : 0 };
    })
    .filter((s) => s.score >= 0.85)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[1].score === scored[0].score) return null;
  return scored[0].c;
}

export type IfsUrlFields = {
  name: string;
  funder?: string | null;
  deadline?: string | null;
  applicationUrl: string;
  detailUrl?: string | null;
  directApplicationUrl?: string | null;
};

export type IfsReconciliation<T> = {
  grant: T;
  changes: string[];
  /** Listed competition the grant was matched to, if any. */
  competition: IfsCompetition | null;
};

/**
 * Make every IFS link on a candidate grant point at a competition that IFS
 * actually lists. Pure given an index; returns the corrected grant plus a log.
 *
 * - Competition URL listed with the same id + uuid: kept.
 * - Competition URL not listed (wrong id, wrong uuid, closed): replaced by the
 *   title-matched competition, or removed.
 * - No IFS URL, but the title matches a listed competition exactly: the official
 *   competition page is added as the detail page.
 */
export function reconcileIfsCompetitionUrls<T extends IfsUrlFields>(grant: T, index: IfsCompetitionIndex): IfsReconciliation<T & IfsUrlFields> {
  const changes: string[] = [];
  const titleMatch = matchIfsCompetitionByTitle(grant.name, index);
  const fields = ["applicationUrl", "detailUrl", "directApplicationUrl"] as const;
  const next: T & IfsUrlFields = { ...grant };
  let competition: IfsCompetition | null = null;

  for (const field of fields) {
    const raw = (next[field] as string | null | undefined)?.trim();
    if (!raw || !isIfsUrl(raw)) continue;
    const parsed = parseIfsCompetitionUrl(raw);
    if (parsed) {
      const listed = index.byId.get(parsed.id);
      if (listed && (!parsed.uuid || parsed.uuid === listed.uuid) && (!titleMatch || titleMatch.id === listed.id)) {
        competition = listed;
        if (raw !== listed.url) {
          (next as Record<string, unknown>)[field] = listed.url;
          changes.push(`${field}: canonicalised IFS competition ${parsed.id}`);
        }
        continue;
      }
      if (titleMatch) {
        competition = titleMatch;
        (next as Record<string, unknown>)[field] = titleMatch.url;
        changes.push(`${field}: IFS competition ${parsed.id} is not listed for this title; replaced with ${titleMatch.id}`);
      } else {
        (next as Record<string, unknown>)[field] = field === "applicationUrl" ? "" : null;
        changes.push(`${field}: removed IFS competition ${parsed.id}, not listed on IFS`);
      }
      continue;
    }
    // Generic IFS page (search, home): point at the specific competition when the title matches.
    if (titleMatch) {
      competition = titleMatch;
      (next as Record<string, unknown>)[field] = titleMatch.url;
      changes.push(`${field}: generic IFS page replaced with competition ${titleMatch.id}`);
    }
  }

  const funderLooksInnovateUk = /innovate uk|ukri|uk research and innovation/i.test(`${grant.funder ?? ""} ${grant.name}`);
  if (!competition && titleMatch && funderLooksInnovateUk) {
    const exact = titleTokens(titleMatch.title).join(" ") === titleTokens(grant.name).join(" ");
    if (exact) {
      competition = titleMatch;
      next.detailUrl = titleMatch.url;
      changes.push(`detailUrl: added official IFS competition ${titleMatch.id}`);
    }
  }

  if (!next.applicationUrl?.trim()) {
    const fallback = next.directApplicationUrl?.trim() || next.detailUrl?.trim() || competition?.url || "";
    next.applicationUrl = fallback;
  }
  if (competition && !next.deadline && competition.closes) {
    next.deadline = competition.closes;
    changes.push(`deadline: set from IFS (${competition.closes})`);
  }
  return { grant: next, changes, competition };
}

const AI_SOURCES = new Set(["openai", "perplexity", "claude", "gemini", "bing", "google"]);

function isSpecificUkriOpportunity(raw?: string | null): boolean {
  try {
    const url = new URL(String(raw ?? "").trim());
    return /(^|\.)ukri\.org$/i.test(url.hostname) && /^\/opportunity\/[^/?#]+/i.test(url.pathname);
  } catch {
    return false;
  }
}

/**
 * An AI-discovered Innovate UK "competition" with no deadline that IFS does not
 * list and that has no specific IFS/UKRI opportunity page cannot be shown as open
 * (e.g. the many "Innovate UK Smart Grants" records while no Smart round is open).
 * Call with the already-reconciled grant.
 */
export function isUnlistedInnovateUkCompetition(
  grant: IfsUrlFields & { source?: string | null },
  index: IfsCompetitionIndex,
): boolean {
  if (!grant.source || !AI_SOURCES.has(grant.source)) return false;
  if (!/innovate uk/i.test(`${grant.funder ?? ""} ${grant.name.slice(0, 20)}`)) return false;
  if (grant.deadline && !Number.isNaN(new Date(grant.deadline).getTime())) return false;
  if (matchIfsCompetitionByTitle(grant.name, index)) return false;
  const urls = [grant.applicationUrl, grant.detailUrl, grant.directApplicationUrl];
  if (urls.some((u) => {
    const parsed = parseIfsCompetitionUrl(u);
    return !!parsed && index.byId.has(parsed.id);
  })) return false;
  return !urls.some(isSpecificUkriOpportunity);
}
