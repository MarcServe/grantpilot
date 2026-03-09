/**
 * Grant ingestion for production: sync from a JSON feed URL or upsert from manual import.
 * Set GRANTS_FEED_URL in env to enable periodic sync (e.g. via Inngest).
 */

import { getSupabaseAdmin } from "@/lib/supabase";
import { looksLikeGenericOrListUrl } from "@/lib/grant-url-validation";

export interface GrantInput {
  externalId?: string;
  name: string;
  funder: string;
  amount?: number | null;
  deadline?: string | null; // ISO date
  applicationUrl: string;
  eligibility: string;
  description?: string | null;
  objectives?: string | null;
  applicantTypes?: string[];
  sectors?: string[];
  regions?: string[];
  /** Which regions this funder serves: US, UK, EU, Global. Used to match user preference. */
  funderLocations?: string[];
  /** Origin: default (feed/manual), claude, openai, gemini for multi-agent discovery. */
  source?: "default" | "claude" | "openai" | "gemini";
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

/**
 * Normalise and validate a single grant from an external feed (array of objects).
 */
export function parseGrantRow(row: unknown): GrantInput | null {
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name : typeof o.title === "string" ? o.title : null;
  const funder = typeof o.funder === "string" ? o.funder : null;
  const applicationUrl = typeof o.applicationUrl === "string" ? o.applicationUrl : typeof o.url === "string" ? o.url : "";
  const eligibility = typeof o.eligibility === "string" ? o.eligibility : typeof o.description === "string" ? o.description : "";

  if (!name || !funder || !applicationUrl) return null;
  if (looksLikeGenericOrListUrl(applicationUrl)) return null;

  const amount = typeof o.amount === "number" ? o.amount : typeof o.amount === "string" ? parseFloat(o.amount) : null;
  const externalId = typeof o.externalId === "string" ? o.externalId : typeof o.id === "string" ? o.id : undefined;

  const funderLocations = toArray(o.funderLocations ?? o.funder_locations);
  const applicantTypes = toArray(o.applicantTypes ?? o.applicant_types);
  const source = typeof o.source === "string" && ["default", "claude", "openai", "gemini"].includes(o.source)
    ? (o.source as "default" | "claude" | "openai" | "gemini")
    : undefined;
  return {
    externalId: externalId || undefined,
    source: source ?? "default",
    name,
    funder,
    amount: amount != null && !Number.isNaN(amount) ? amount : null,
    deadline: typeof o.deadline === "string" ? o.deadline : o.deadline != null ? String(o.deadline) : null,
    applicationUrl,
    eligibility: eligibility || "See application page.",
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
    applicationUrl: input.applicationUrl,
    eligibility: input.eligibility,
    description: input.description ?? null,
    objectives: input.objectives ?? null,
    applicantTypes,
    sectors,
    regions,
    funderLocations,
    source,
  };

  if (input.externalId) {
    const { data: existing } = await supabase
      .from("Grant")
      .select("id")
      .eq("externalId", input.externalId)
      .maybeSingle();

    if (existing) {
      await supabase.from("Grant").update(data).eq("id", existing.id);
      return { id: existing.id, created: false };
    }
  }

  const { data: grant, error } = await supabase
    .from("Grant")
    .insert({
      ...data,
      externalId: input.externalId ?? null,
    })
    .select("id")
    .single();

  if (error || !grant) throw new Error(error?.message ?? "Failed to create grant");
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
