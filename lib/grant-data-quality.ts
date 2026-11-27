/**
 * Record-level grant data-quality rules shared by ingestion (reject before insert)
 * and matching (keep existing bad rows out of matches until they are cleaned up).
 *
 * Every rule is deliberately conservative: it must be safe to run on the hot
 * matching path, and a false positive hides a real grant from users.
 */

import { isGrantAggregatorUrl } from "@/lib/grant-application-url-quality";
import { normalizeGrantTextKey, normalizeGrantDeadlineKey } from "@/lib/grant-candidate-quality";

export type GrantDataQualityIssueCode =
  | "listing_page"
  | "aggregator_only"
  | "title_year_passed"
  | "source_unverified";

export type GrantDataQualityIssue = {
  code: GrantDataQualityIssueCode;
  message: string;
};

export type GrantDataQualityInput = {
  name?: string | null;
  funder?: string | null;
  deadline?: string | Date | null;
  applicationUrl?: string | null;
  detailUrl?: string | null;
  directApplicationUrl?: string | null;
  source?: string | null;
};

/** Providers whose records come from model/web search output rather than a funder feed. */
const AI_DISCOVERY_SOURCES = new Set(["openai", "perplexity", "claude", "gemini", "bing", "google"]);

// ---------------------------------------------------------------------------
// Listing pages stored as grants
// ---------------------------------------------------------------------------

const LISTING_TITLE_PATTERNS: RegExp[] = [
  /\b(?:grants?|funding)\s+calendar\b/i,
  /\bcalendar\s+of\s+(?:grants?|funding)\b/i,
  /\blisting\b/i,
  /\bdirectory(?:\s+entry)?\b/i,
  /\bdatabase\s+of\b/i,
  /\bround-?up\b/i,
  /\blist\s+(?:of|including)\b/i,
  /\b(?:programs?|programmes?|grants?|funding|schemes?)\s+list\b/i,
  /\b(?:complete|ultimate|definitive)\b.{0,40}\bguide\b/i,
  /\bguide\s+to\s+(?:\w+\s+){0,3}(?:grants?|funding)\b/i,
  /\btop\s+\d+\b/i,
  /\b\d+\s+best\b/i,
  /\bcurrent\s+(?:grant|funding)\s+opportunities\b/i,
  /\b(?:funding|grant)\s+(?:finder|search tool)\b/i,
];

/** Words that, on their own, only describe "grants in general" rather than one scheme. */
const GENERIC_TITLE_WORDS = new Set([
  "a", "ai", "an", "and", "available", "british", "business", "businesses", "england", "for", "funding",
  "government", "grant", "grants", "in", "london", "new", "of", "opportunities", "options", "programmes",
  "programs", "schemes", "scotland", "sme", "smes", "small", "start", "startup", "startups", "support", "tech",
  "technology", "the", "to", "uk", "united", "kingdom", "up", "us", "wales", "your", "medium", "sized",
  "companies", "company", "enterprises", "latest", "current", "open", "best", "top",
]);

/**
 * @param options.allowGenericWordHeuristic  The "every word is generic" check is only
 *   trusted for AI/web discoveries; funder feeds legitimately use names such as
 *   "Small Grants" or "Open Funding".
 */
export function isListingPageTitle(name?: string | null, options?: { allowGenericWordHeuristic?: boolean }): boolean {
  const title = String(name ?? "").trim();
  if (!title) return false;
  if (/\bcalendar\s+year\b/i.test(title) && !/\b(?:grants?|funding)\s+calendar\b/i.test(title)) {
    return LISTING_TITLE_PATTERNS.filter((p) => !/calendar/.test(p.source)).some((p) => p.test(title));
  }
  if (LISTING_TITLE_PATTERNS.some((pattern) => pattern.test(title))) return true;
  const words = normalizeGrantTextKey(title).split(" ").filter(Boolean).filter((w) => !/^20\d{2}$/.test(w));
  // "AI Grants UK for Small Businesses", "Business Grants 2026": every word is generic.
  if (options?.allowGenericWordHeuristic === false) return false;
  return words.length > 0 && words.some((w) => w === "grant" || w === "grants" || w === "funding")
    && words.every((w) => GENERIC_TITLE_WORDS.has(w));
}

// ---------------------------------------------------------------------------
// Titles pinned to a past year ("Cohort 2023", "Fall 2023", "Call 2023")
// ---------------------------------------------------------------------------

export function latestYearInTitle(name?: string | null): number | null {
  const title = String(name ?? "");
  let latest: number | null = null;
  // Years that name a law or a former identifier don't date the opportunity.
  const cleaned = title
    .replace(/\b(?:act|law|bill|regulations?)\s+of\s+20\d{2}\b/gi, " ")
    .replace(/\bformerly\b[^)]*\)?/gi, " ")
    .replace(/\b(?:since|est\.?|established|founded)\s+(?:in\s+)?20\d{2}\b/gi, " ");
  for (const m of cleaned.matchAll(/\b(20\d{2})(?:\s*[/–-]\s*(?:fy\s*)?(20\d{2}|\d{2}))?\b/gi)) {
    let year = Number(m[1]);
    if (m[2]) {
      const end = m[2].length === 2 ? Math.floor(year / 100) * 100 + Number(m[2]) : Number(m[2]);
      if (end > year && end - year <= 10) year = end;
    }
    latest = latest == null ? year : Math.max(latest, year);
  }
  return latest;
}

function parseDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isTitleYearPassed(grant: Pick<GrantDataQualityInput, "name" | "deadline">, now = new Date()): boolean {
  const year = latestYearInTitle(grant.name);
  if (year == null) return false;
  const currentYear = now.getUTCFullYear();
  if (year >= currentYear) return false;
  const deadline = parseDate(grant.deadline);
  const futureDeadline = !!deadline && deadline.getTime() >= new Date(now).setUTCHours(0, 0, 0, 0);
  // A future deadline can rescue last year's title (e.g. "2025 round" closing in January),
  // but not a title two or more years old: that deadline is almost certainly invented.
  return !futureDeadline || year < currentYear - 1;
}

// ---------------------------------------------------------------------------
// Aggregator-only and source-unverified records
// ---------------------------------------------------------------------------

function presentUrls(grant: GrantDataQualityInput): string[] {
  return [grant.directApplicationUrl, grant.applicationUrl, grant.detailUrl]
    .map((u) => String(u ?? "").trim())
    .filter(Boolean);
}

export function isAggregatorOnly(grant: GrantDataQualityInput): boolean {
  const urls = presentUrls(grant);
  return urls.length > 0 && urls.every((u) => isGrantAggregatorUrl(u));
}

const GENERIC_PATH_WORDS = new Set([
  "a", "and", "advice", "banking", "business", "businesses", "category", "en", "en-gb", "finance", "financing",
  "for", "funding", "grant", "grants", "help", "html", "htm", "aspx", "php", "incentives", "index", "opportunities",
  "opportunity", "our", "work", "programme", "programmes", "program", "programs", "resources", "scheme", "schemes",
  "services", "support", "the", "uk", "what", "we", "do", "and", "available", "current", "open",
]);

/** A path made only of generic words: /business/business-support-and-advice, /funding/funding-programmes. */
function isGenericPath(pathname: string): boolean {
  const words = pathname.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.every((w) => GENERIC_PATH_WORDS.has(w));
}

function isNonSpecificUrl(raw: string): boolean {
  if (isGrantAggregatorUrl(raw)) return true;
  try {
    const url = new URL(raw);
    // Filtered search results (?keywords=, ?filter_...) are listings even on funder sites.
    if (url.search && /(^|&|\?)(keywords?|q|query|search|filter[^=]*)=/i.test(url.search)) return true;
    return isGenericPath(url.pathname);
  } catch {
    return true;
  }
}

/**
 * AI-discovered, no deadline, and nothing but listing/home pages to show for it:
 * the record cannot be traced to a funder page, so it must not be offered as open.
 * (E.g. "Bristol Tech Fund" pointing at a council's general business-support page.)
 */
export function isAiDiscoverySource(source?: string | null): boolean {
  return !!source && AI_DISCOVERY_SOURCES.has(source);
}

export function isSourceUnverified(grant: GrantDataQualityInput): boolean {
  if (!isAiDiscoverySource(grant.source)) return false;
  if (parseDate(grant.deadline)) return false;
  const urls = presentUrls(grant);
  return urls.length > 0 && urls.every(isNonSpecificUrl);
}

export function getGrantDataQualityIssue(grant: GrantDataQualityInput, now = new Date()): GrantDataQualityIssue | null {
  if (isListingPageTitle(grant.name, { allowGenericWordHeuristic: isAiDiscoverySource(grant.source) })) {
    return { code: "listing_page", message: "This record is a funding listing or guide page, not a single grant." };
  }
  if (isTitleYearPassed(grant, now)) {
    return {
      code: "title_year_passed",
      message: `This opportunity is named for ${latestYearInTitle(grant.name)} and has no current deadline, so it is treated as closed.`,
    };
  }
  if (isAggregatorOnly(grant)) {
    return { code: "aggregator_only", message: "This grant is only known from a third-party grant directory, not the funder." };
  }
  if (isSourceUnverified(grant)) {
    return {
      code: "source_unverified",
      message: "This grant could not be traced to a specific funder page and has no deadline, so it is not shown as open.",
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Identity key for de-duplication across sources
// ---------------------------------------------------------------------------

const IDENTITY_STOPWORDS = new Set(["the", "a", "an", "of", "for", "and", "uk", "scheme", "programme", "program"]);
const FUNDER_ALIASES = ["innovate uk", "ukri", "uk research and innovation"];

function singular(word: string): string {
  if (/^(grants|funds|awards|loans|vouchers|competitions|prizes|calls)$/.test(word)) return word.slice(0, -1);
  return word;
}

/**
 * Name-based identity that survives the variations aggregators introduce:
 * funder prefixes ("Innovate UK Smart Grants" vs "Smart Grants"), plurals,
 * punctuation ("Powering Local Businesses: Business Resilience Grant") and "(UK)".
 */
export function grantIdentityKey(grant: Pick<GrantDataQualityInput, "name" | "funder">): string {
  let name = normalizeGrantTextKey(grant.name);
  const funder = normalizeGrantTextKey(grant.funder);
  const prefixes = [...FUNDER_ALIASES, ...(funder && funder.split(" ").length <= 4 ? [funder] : [])];
  for (const prefix of prefixes) {
    if (prefix && name.startsWith(`${prefix} `)) name = name.slice(prefix.length + 1);
  }
  return name
    .split(" ")
    .filter((w) => w && !IDENTITY_STOPWORDS.has(w))
    .map(singular)
    .join(" ");
}

export function identityTokens(grant: Pick<GrantDataQualityInput, "name" | "funder">): Set<string> {
  return new Set(grantIdentityKey(grant).split(" ").filter(Boolean));
}

export function nameSimilarity(a: Pick<GrantDataQualityInput, "name" | "funder">, b: Pick<GrantDataQualityInput, "name" | "funder">): number {
  const ta = identityTokens(a);
  const tb = identityTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  const inter = [...ta].filter((t) => tb.has(t)).length;
  return inter / new Set([...ta, ...tb]).size;
}

/** Identity words that say nothing about which scheme it is ("Innovation Fund", "Small Grant"). */
const WEAK_IDENTITY_WORDS = new Set([
  ...GENERIC_TITLE_WORDS, "accelerator", "award", "challenge", "community", "competition", "development", "digital",
  "enterprise", "from", "fund", "grant", "growth", "innovation", "link", "loan", "prize", "project", "research",
  "scheme", "voucher", "business", "local", "general", "national", "regional",
]);

const FUNDER_STOPWORDS = new Set([
  "the", "of", "and", "for", "uk", "city", "council", "ltd", "limited", "plc", "government", "part", "via", "by",
  "foundation", "trust", "fund", "agency", "department", "office", "national", "programme",
]);

function funderTokens(funder?: string | null): Set<string> {
  let text = normalizeGrantTextKey(funder);
  text = text.replace(/\b(innovate uk|ukri|uk research and innovation)\b/g, " ukri ");
  return new Set(text.split(" ").filter((w) => w.length > 1 && !FUNDER_STOPWORDS.has(w)));
}

/** True when the identity key alone is too generic to merge two records on. */
export function isWeakIdentityKey(key: string): boolean {
  const words = key.split(" ").filter(Boolean);
  return words.length === 0 || words.every((w) => WEAK_IDENTITY_WORDS.has(w) || /^20\d{2}$/.test(w));
}

/**
 * Same grant if identity keys match, the key is specific enough, funders agree
 * (share a meaningful word, Innovate UK/UKRI treated as one) and deadlines don't
 * contradict each other.
 */
export function isSameGrantIdentity(a: GrantDataQualityInput, b: GrantDataQualityInput): boolean {
  const ka = grantIdentityKey(a);
  if (!ka || ka !== grantIdentityKey(b) || isWeakIdentityKey(ka)) return false;
  const fa = funderTokens(a.funder);
  const fb = funderTokens(b.funder);
  if (fa.size > 0 && fb.size > 0) {
    if (![...fa].some((t) => fb.has(t))) return false;
  } else if (ka.split(" ").length < 3) {
    return false;
  }
  const da = normalizeGrantDeadlineKey(a.deadline ?? null);
  const db = normalizeGrantDeadlineKey(b.deadline ?? null);
  return !da || !db || da === db;
}

/** The token most likely to narrow a DB search for identity candidates. */
export function identitySearchToken(grant: Pick<GrantDataQualityInput, "name" | "funder">): string | null {
  const tokens = [...identityTokens(grant)].filter((t) => t.length >= 4 && !/^20\d{2}$/.test(t));
  if (tokens.length === 0) return null;
  return tokens.sort((a, b) => b.length - a.length)[0];
}

/**
 * Rank duplicate rows: official funder link first, then a real deadline, then a
 * verified application URL, then the oldest record (keeps saved/applied links).
 */
export function grantRecordStrength(grant: GrantDataQualityInput & { applicationUrlQuality?: string | null; createdAt?: string | null; url_status?: string | null }): number {
  let score = 0;
  const urls = presentUrls(grant);
  if (urls.some((u) => /(^|\.)(gov\.uk|ukri\.org|europa\.eu|grants\.gov)$/i.test(safeHost(u)))) score += 40;
  if (urls.some((u) => !isNonSpecificUrl(u))) score += 20;
  if (parseDate(grant.deadline)) score += 15;
  if (grant.applicationUrlQuality === "verified_direct" || grant.applicationUrlQuality === "verified_portal") score += 10;
  if (grant.url_status === "dead" || grant.url_status === "expired") score -= 50;
  if (grant.source === "default" || grant.source === "grants-gov" || grant.source === "admin") score += 5;
  return score;
}

function safeHost(raw: string): string {
  try {
    return new URL(raw).hostname;
  } catch {
    return "";
  }
}
