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

async function findExistingByUrl(supabase: SupabaseAdmin, url: string): Promise<{ id: string } | null> {
  for (const column of ["applicationUrl", "detailUrl", "directApplicationUrl"] as const) {
    const { data, error } = await supabase
      .from("Grant")
      .select("id")
      .eq(column, url)
      .limit(1);
    if (error) continue;
    const row = Array.isArray(data) ? data[0] : null;
    if (row?.id) return row as { id: string };
  }
  return null;
}

export async function findExistingGrantCandidate(
  supabase: SupabaseAdmin,
  input: GrantInput,
  options?: { externalId?: string | null; deadline?: Date | null }
): Promise<{ id: string } | null> {
  const fallbackExternalId = computeGrantHash(input.name, input.funder, input.deadline);
  const externalIds = Array.from(new Set([
    options?.externalId?.trim(),
    input.externalId?.trim(),
    fallbackExternalId,
  ].filter((value): value is string => Boolean(value))));

  for (const externalId of externalIds) {
    const { data, error } = await supabase
      .from("Grant")
      .select("id")
      .eq("externalId", externalId)
      .maybeSingle();
    if (!error && data?.id) return data as { id: string };
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
  ]));

  for (const url of urlCandidates) {
    const existing = await findExistingByUrl(supabase, url);
    if (existing) return existing;
  }

  const candidateTextKey = grantCandidateTextKey({
    name: input.name,
    funder: input.funder,
    deadline: options?.deadline ?? input.deadline,
  });
  const { data: textMatches } = await supabase
    .from("Grant")
    .select("id, name, funder, deadline")
    .eq("name", input.name)
    .eq("funder", input.funder)
    .limit(10);

  for (const row of (textMatches ?? []) as Array<{ id: string; name?: string | null; funder?: string | null; deadline?: string | null }>) {
    if (grantCandidateTextKey(row) === candidateTextKey) return { id: row.id };
  }

  return null;
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
export async function upsertGrant(input: GrantInput): Promise<{ id: string; created: boolean }> {
  const supabase = getSupabaseAdmin();
  const deadline = parseDeadline(input.deadline);
  if (isPastGrantDeadline(deadline)) {
    throw new Error(`Grant deadline has passed: ${input.name}`);
  }
  const freshness = getGrantFreshnessStatus(input);
  if (!freshness.usable) {
    throw new Error(freshness.message ?? `Grant appears closed: ${input.name}`);
  }

  const detailUrl = input.detailUrl?.trim() || input.applicationUrl.trim();
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
    await supabase.from("Grant").update(data).eq("id", existing.id);
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
