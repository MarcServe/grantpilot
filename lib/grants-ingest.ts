import { resolveGrantSourceLinks } from "@/lib/grant-source-links";
/**
 * Grant ingestion for production: sync from JSON feeds, manual imports, and AI/search
 * discovery sources. Every source can add grants; trusted matching still flows through
 * the OpenAI eligibility checker.
 */

import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { looksLikeGenericOrListUrl } from "@/lib/grant-url-validation";
import { enqueueGrantForScoutIfProgrammeUrl } from "@/lib/enqueue-scout";
import { requestGrantPostprocess } from "@/lib/grant-postprocess";
import { getGrantFreshnessStatus, isPastGrantDeadline } from "@/lib/grant-freshness";
import { verifyGrantActionable } from "@/lib/grant-actionability";
import {
  classifyGrantApplicationUrl,
  isVerifiedApplicationQuality,
  type ApplicationUrlClassification,
} from "@/lib/grant-application-url-quality";
import {
  canonicalizeGrantUrl,
  grantCandidateTextKey,
  grantCandidateUrlCandidates,
} from "@/lib/grant-candidate-quality";
import {
  getGrantDataQualityIssue,
  grantRecordStrength,
  identitySearchToken,
  isSameGrantIdentity,
  nameSimilarity,
} from "@/lib/grant-data-quality";
import {
  isIfsUrl,
  isUnlistedInnovateUkCompetition,
  loadIfsCompetitionIndex,
  reconcileIfsCompetitionUrls,
} from "@/lib/ifs-competitions";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

/** Normalize string for hashing: lowercase, trim, collapse whitespace. */
function normalizeForHash(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Compute a stable externalId for deduplication when the source does not provide one.
 * hash(grant_name + funder + deadline) so the same grant from multiple sources upserts once.
 */
export function computeGrantHash(
  name: string,
  funder: string,
  deadline: string | null | undefined
): string {
  const payload = `${normalizeForHash(name)}|${normalizeForHash(funder)}|${normalizeForHash(deadline ?? "")}`;
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

export interface GrantInput {
  externalId?: string;
  name: string;
  funder: string;
  amount?: number | null;
  deadline?: string | null; // ISO date
  applicationUrl: string;
  /** Official grant/detail page, even if the application starts elsewhere. */
  detailUrl?: string | null;
  /** Confirmed direct form or official portal start URL. */
  directApplicationUrl?: string | null;
  eligibility: string;
  description?: string | null;
  objectives?: string | null;
  applicantTypes?: string[];
  sectors?: string[];
  regions?: string[];
  /** Which regions this funder serves: US, UK, EU, Global. Used to match user preference. */
  funderLocations?: string[];
  /** Origin finder. Kept for ops/debugging; customer-facing confidence comes from OpenAI scoring. */
  source?: "default" | "claude" | "openai" | "gemini" | "perplexity" | "grants-gov" | "bing" | "google" | "admin";
}

function toArray(x: unknown): string[] {
  if (Array.isArray(x)) return x.filter((v): v is string => typeof v === "string");
  if (typeof x === "string") return [x];
  return [];
}

function parseDeadline(v: unknown): Date | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

type ExistingGrantRow = {
  id: string;
  name?: string | null;
  funder?: string | null;
  deadline?: string | null;
  applicationUrl?: string | null;
  detailUrl?: string | null;
  directApplicationUrl?: string | null;
  applicationUrlQuality?: string | null;
  source?: string | null;
  url_status?: string | null;
  createdAt?: string | null;
};

const EXISTING_GRANT_COLUMNS =
  "id, name, funder, deadline, applicationUrl, detailUrl, directApplicationUrl, applicationUrlQuality, source, url_status, createdAt";

/** Minimum name overlap for a URL or derived-id hit to count as the same grant. */
const SAME_GRANT_NAME_SIMILARITY = 0.5;

/**
 * URLs shared by many unrelated grants (funder homepages, search/listing pages,
 * aggregators) must never be used to identify a grant: matching on them made new
 * discoveries overwrite the name and links of whichever grant held that URL first.
 */
export function isIdentifyingGrantUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length === 0) return false;
    // Funder hub pages such as /apply-for-funding or /business-grants.
    if (segments.length === 1 && /apply|funding|grants?|opportunit|competition|support|finance/i.test(segments[0])) return false;
  } catch {
    return false;
  }
  if (looksLikeGenericOrListUrl(url)) return false;
  return classifyGrantApplicationUrl(url).kind !== "generic_listing";
}

function looksLikeSameGrant(input: GrantInput, row: ExistingGrantRow): boolean {
  if (!row.name) return true;
  return isSameGrantIdentity(input, row) || nameSimilarity(input, row) >= SAME_GRANT_NAME_SIMILARITY;
}

async function findExistingByUrl(supabase: SupabaseAdmin, url: string, input: GrantInput): Promise<ExistingGrantRow | null> {
  for (const column of ["applicationUrl", "detailUrl", "directApplicationUrl"] as const) {
    const { data, error } = await supabase
      .from("Grant")
      .select(EXISTING_GRANT_COLUMNS)
      .eq(column, url)
      .limit(10);
    if (error) continue;
    const row = ((data ?? []) as ExistingGrantRow[]).find((candidate) => looksLikeSameGrant(input, candidate));
    if (row?.id) return row;
  }
  return null;
}

/** Same grant re-listed under a different source/URL/wording (e.g. 14 "Smart Grants" rows). */
async function findExistingByIdentity(supabase: SupabaseAdmin, input: GrantInput): Promise<ExistingGrantRow | null> {
  const token = identitySearchToken(input);
  if (!token) return null;
  const { data, error } = await supabase
    .from("Grant")
    .select(EXISTING_GRANT_COLUMNS)
    .ilike("name", `%${token}%`)
    .limit(200);
  if (error) return null;
  const matches = ((data ?? []) as ExistingGrantRow[]).filter((row) => isSameGrantIdentity(input, row));
  if (matches.length === 0) return null;
  return matches.sort((a, b) => grantRecordStrength(b) - grantRecordStrength(a)
    || String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")))[0];
}

export async function findExistingGrantCandidate(
  supabase: SupabaseAdmin,
  input: GrantInput,
  options?: { externalId?: string | null; deadline?: Date | null }
): Promise<ExistingGrantRow | null> {
  const fallbackExternalId = computeGrantHash(input.name, input.funder, input.deadline);
  const externalIds = Array.from(new Set([
    options?.externalId?.trim(),
    input.externalId?.trim(),
    fallbackExternalId,
  ].filter((value): value is string => Boolean(value))));

  for (const externalId of externalIds) {
    const { data, error } = await supabase
      .from("Grant")
      .select(EXISTING_GRANT_COLUMNS)
      .eq("externalId", externalId)
      .maybeSingle();
    if (error || !data?.id) continue;
    const row = data as ExistingGrantRow;
    // Discovery ids are derived from the name at first sight; a row that has since
    // been renamed is no longer that grant, so don't let the id pull it back.
    if (externalId.startsWith("discovery-") && !looksLikeSameGrant(input, row)) continue;
    return row;
  }

  const rawUrls = [
    input.directApplicationUrl,
    input.applicationUrl,
    input.detailUrl,
  ]
    .map((url) => String(url ?? "").trim())
    .filter(Boolean);
  const urlCandidates = Array.from(new Set([
    ...grantCandidateUrlCandidates(input),
    ...rawUrls,
    ...rawUrls.map(canonicalizeGrantUrl).filter((url): url is string => Boolean(url)),
  ])).filter(isIdentifyingGrantUrl);

  for (const url of urlCandidates) {
    const existing = await findExistingByUrl(supabase, url, input);
    if (existing) return existing;
  }

  const candidateTextKey = grantCandidateTextKey({
    name: input.name,
    funder: input.funder,
    deadline: options?.deadline ?? input.deadline,
  });
  const { data: textMatches } = await supabase
    .from("Grant")
    .select(EXISTING_GRANT_COLUMNS)
    .eq("name", input.name)
    .eq("funder", input.funder)
    .limit(10);

  for (const row of (textMatches ?? []) as ExistingGrantRow[]) {
    if (grantCandidateTextKey(row) === candidateTextKey) return row;
  }

  return findExistingByIdentity(supabase, input);
}

/**
 * Correct Innovate UK IFS links against the live competition index. Fails open
 * (returns the input) when IFS cannot be reached.
 */
export async function reconcileGrantInputWithIfs(input: GrantInput): Promise<GrantInput> {
  const touchesIfs = [input.applicationUrl, input.detailUrl, input.directApplicationUrl].some(isIfsUrl)
    || /innovate uk|ukri|uk research and innovation/i.test(`${input.funder} ${input.name}`);
  if (!touchesIfs) return input;
  const index = await loadIfsCompetitionIndex();
  if (!index) return input;
  const { grant, changes } = reconcileIfsCompetitionUrls(input, index);
  if (changes.length > 0) console.log(`[grants-ingest] IFS reconcile "${input.name}": ${changes.join("; ")}`);
  if (isUnlistedInnovateUkCompetition(grant, index)) {
    throw new Error(`Grant record is not actionable (ifs_not_listed): ${input.name} is not an open Innovate UK competition on IFS and has no deadline`);
  }
  return grant;
}

/**
 * Normalise and validate a single grant from an external feed (array of objects).
 */
export function parseGrantRow(row: unknown): GrantInput | null {
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name : typeof o.title === "string" ? o.title : null;
  const funder = typeof o.funder === "string" ? o.funder : null;
  const detailUrl =
    typeof o.detailUrl === "string"
      ? o.detailUrl.trim()
      : typeof o.detail_url === "string"
        ? o.detail_url.trim()
        : typeof o.detail_link === "string"
          ? o.detail_link.trim()
          : "";
  const directApplicationUrl =
    typeof o.directApplicationUrl === "string"
      ? o.directApplicationUrl.trim()
      : typeof o.direct_application_url === "string"
        ? o.direct_application_url.trim()
        : typeof o.direct_application_link === "string"
          ? o.direct_application_link.trim()
          : "";
  const legacyApplicationUrl =
    typeof o.applicationUrl === "string" ? o.applicationUrl.trim() : typeof o.url === "string" ? o.url.trim() : "";
  const applicationUrl = directApplicationUrl || legacyApplicationUrl || detailUrl;
  const eligibility = typeof o.eligibility === "string" ? o.eligibility : typeof o.description === "string" ? o.description : "";
  const description = typeof o.description === "string" ? o.description : null;
  const objectives = typeof o.objectives === "string" ? o.objectives : null;

  if (!name || !funder || !applicationUrl) return null;
  if (!directApplicationUrl && looksLikeGenericOrListUrl(applicationUrl)) return null;

  const amount = typeof o.amount === "number" ? o.amount : typeof o.amount === "string" ? parseFloat(o.amount) : null;
  const externalId = typeof o.externalId === "string" ? o.externalId : typeof o.id === "string" ? o.id : undefined;
  const parsedDeadline = parseDeadline(o.deadline);
  if (isPastGrantDeadline(parsedDeadline)) return null;
  const freshness = getGrantFreshnessStatus({
    deadline: parsedDeadline,
    name,
    eligibility,
    description,
    objectives,
  });
  if (!freshness.usable) return null;

  const funderLocations = toArray(o.funderLocations ?? o.funder_locations);
  const applicantTypes = toArray(o.applicantTypes ?? o.applicant_types);
  const source = typeof o.source === "string" &&
    ["default", "claude", "openai", "gemini", "perplexity", "grants-gov", "bing", "google", "admin"].includes(o.source)
    ? (o.source as GrantInput["source"])
    : undefined;
  return {
    externalId: externalId || undefined,
    source: source ?? "default",
    name,
    funder,
    amount: amount != null && !Number.isNaN(amount) ? amount : null,
    deadline: typeof o.deadline === "string" ? o.deadline : o.deadline != null ? String(o.deadline) : null,
    applicationUrl,
    detailUrl: detailUrl || legacyApplicationUrl || applicationUrl,
    directApplicationUrl: directApplicationUrl || null,
    eligibility: eligibility || "See application page.",
    description,
    objectives,
    sectors: toArray(o.sectors ?? o.sector),
    regions: toArray(o.regions ?? o.region),
    funderLocations: funderLocations.length > 0 ? funderLocations : undefined,
    applicantTypes: applicantTypes.length > 0 ? applicantTypes : undefined,
  };
}

/**
 * Upsert one grant. Uses externalId when present; otherwise creates a new record.
 */
export async function upsertGrant(rawInput: GrantInput): Promise<{ id: string; created: boolean }> {
  const supabase = getSupabaseAdmin();
  const input = await reconcileGrantInputWithIfs(rawInput);
  if (!input.applicationUrl?.trim()) {
    throw new Error(`Grant URL is not actionable: no verifiable link left for ${input.name}`);
  }
  const qualityIssue = getGrantDataQualityIssue(input);
  if (qualityIssue) {
    throw new Error(`Grant record is not actionable (${qualityIssue.code}): ${qualityIssue.message}`);
  }
  const deadline = parseDeadline(input.deadline);
  if (isPastGrantDeadline(deadline)) {
    throw new Error(`Grant deadline has passed: ${input.name}`);
  }
  const freshness = getGrantFreshnessStatus(input);
  if (!freshness.usable) {
    throw new Error(freshness.message ?? `Grant appears closed: ${input.name}`);
  }

  const detailUrl = resolveGrantSourceLinks(input).sourceUrl ?? input.detailUrl?.trim() ?? input.applicationUrl.trim();
  const directCandidate = input.directApplicationUrl?.trim() || input.applicationUrl.trim();
  const directClassification = classifyGrantApplicationUrl(directCandidate);
  const detailClassification = classifyGrantApplicationUrl(detailUrl);

  if (directClassification.quality === "rejected" && detailClassification.quality === "rejected") {
    throw new Error(`Grant URL is not actionable: ${directClassification.reason}`);
  }

  const directApplicationUrl = isVerifiedApplicationQuality(directClassification.quality) ? directCandidate : null;
  const selectedClassification: ApplicationUrlClassification = directApplicationUrl
    ? directClassification
    : detailClassification;
  const canonicalApplicationUrl = directApplicationUrl ?? detailUrl;
  const verificationInput = { ...input, applicationUrl: canonicalApplicationUrl, detailUrl, directApplicationUrl };

  const sectors = input.sectors?.length ? input.sectors : ["Other"];
  const regions = input.regions?.length ? input.regions : ["England"];
  const funderLocations = input.funderLocations?.length ? input.funderLocations : [];

  const source = input.source ?? "default";
  const applicantTypes = input.applicantTypes?.length ? input.applicantTypes : [];
  const data = {
    name: input.name,
    funder: input.funder,
    amount: input.amount ?? null,
    deadline: deadline?.toISOString() ?? null,
    applicationUrl: canonicalApplicationUrl,
    detailUrl,
    directApplicationUrl,
    applicationUrlKind: selectedClassification.kind,
    applicationUrlQuality: selectedClassification.quality,
    applicationUrlConfidence: selectedClassification.confidence,
    applicationUrlVerifiedAt: directApplicationUrl ? new Date().toISOString() : null,
    applicationUrlQualityReason: selectedClassification.reason,
    eligibility: input.eligibility,
    description: input.description ?? null,
    objectives: input.objectives ?? null,
    applicantTypes,
    sectors,
    regions,
    funderLocations,
    source,
  };

  const externalId =
    input.externalId?.trim() ||
    computeGrantHash(input.name, input.funder, input.deadline);

  const existing = await findExistingGrantCandidate(supabase, verificationInput, { externalId, deadline });
  if (existing) {
    // Never let a weaker listing (aggregator, generic page, no deadline) overwrite
    // the identity or links of a stronger record it was matched to.
    const incomingStrength = grantRecordStrength({ ...data, url_status: null });
    const keepExisting = existing.name != null && grantRecordStrength(existing) > incomingStrength;
    const update: Record<string, unknown> = keepExisting
      ? (existing.deadline || !data.deadline ? {} : { deadline: data.deadline })
      : data;
    if (Object.keys(update).length > 0) {
      await supabase.from("Grant").update(update).eq("id", existing.id);
    }
    if (keepExisting) return { id: existing.id, created: false };
    if (!directApplicationUrl && detailClassification.quality === "needs_scout") {
      await enqueueGrantForScoutIfProgrammeUrl(existing.id).catch(() => {});
    }
    await requestGrantPostprocess({
      grantId: existing.id,
      applicationUrl: canonicalApplicationUrl,
      context: verificationInput,
    });
    return { id: existing.id, created: false };
  }

  const verified = await verifyGrantActionable(verificationInput);
  if (!verified.usable) {
    throw new Error(verified.message ?? `Grant appears closed: ${input.name}`);
  }

  const { data: grant, error } = await supabase
    .from("Grant")
    .insert({
      ...data,
      externalId,
    })
    .select("id")
    .single();

  if (error || !grant) throw new Error(error?.message ?? "Failed to create grant");
  if (!directApplicationUrl && detailClassification.quality === "needs_scout") {
    await enqueueGrantForScoutIfProgrammeUrl(grant.id).catch(() => {});
  }
  await requestGrantPostprocess({
    grantId: grant.id,
    applicationUrl: canonicalApplicationUrl,
    context: verificationInput,
  });

  return { id: grant.id, created: true };
}

/**
 * Fetch JSON from URL and return parsed array of grant-like objects.
 */
export async function fetchGrantsFromFeed(url: string): Promise<GrantInput[]> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Grants feed failed: ${res.status} ${res.statusText}`);

  const raw = await res.json();
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { grants?: unknown }).grants) ? (raw as { grants: unknown[] }).grants : [];
  const out: GrantInput[] = [];
  for (const row of list) {
    const g = parseGrantRow(row);
    if (g) out.push(g);
  }
  return out;
}

/**
 * Sync grants from GRANTS_FEED_URL. No-op if env not set.
 * Returns { synced, created, updated }.
 */
export async function syncGrantsFromFeed(): Promise<{ synced: number; created: number; updated: number }> {
  const url = process.env.GRANTS_FEED_URL;
  if (!url?.trim()) return { synced: 0, created: 0, updated: 0 };

  const grants = await fetchGrantsFromFeed(url.trim());
  let created = 0;
  let updated = 0;
  for (const g of grants) {
    const { created: c } = await upsertGrant(g);
    if (c) created++;
    else updated++;
  }
  return { synced: grants.length, created, updated };
}

/**
 * Sync grants from Grants.gov (real-time US federal opportunities). No API key required.
 * Fetches up to maxTotal (default 500) via pagination.
 */
export async function syncGrantsFromGrantsGov(maxTotal = 500): Promise<{ synced: number; created: number; updated: number }> {
  const { fetchGrantsFromGrantsGov } = await import("@/lib/grants-gov");
  const grants = await fetchGrantsFromGrantsGov(maxTotal);
  let created = 0;
  let updated = 0;
  for (const g of grants) {
    try {
      const { created: c } = await upsertGrant(g);
      if (c) created++;
      else updated++;
    } catch (e) {
      console.warn("[grants-ingest] Skip grant", g.externalId, e);
    }
  }
  return { synced: grants.length, created, updated };
}

/**
 * Sync UK grants (curated list; links to Find a Grant). Optional future: data.gov.uk feed.
 */
export async function syncGrantsFromUK(): Promise<{ synced: number; created: number; updated: number }> {
  const { fetchGrantsFromUK } = await import("@/lib/grants-uk");
  const grants = await fetchGrantsFromUK();
  let created = 0;
  let updated = 0;
  for (const g of grants) {
    try {
      const { created: c } = await upsertGrant(g);
      if (c) created++;
      else updated++;
    } catch (e) {
      console.warn("[grants-ingest] Skip UK grant", g.externalId, e);
    }
  }
  return { synced: grants.length, created, updated };
}

/**
 * Sync EU grants (curated list; links to Funding & Tenders Portal). Optional: EU_GRANTS_FEED_URL for custom feed.
 */
export async function syncGrantsFromEU(): Promise<{ synced: number; created: number; updated: number }> {
  const { fetchGrantsFromEU } = await import("@/lib/grants-eu");
  const grants = await fetchGrantsFromEU();
  let created = 0;
  let updated = 0;
  for (const g of grants) {
    try {
      const { created: c } = await upsertGrant(g);
      if (c) created++;
      else updated++;
    } catch (e) {
      console.warn("[grants-ingest] Skip EU grant", g.externalId, e);
    }
  }
  return { synced: grants.length, created, updated };
}
