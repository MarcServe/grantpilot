import type { GrantInput } from "./grants-ingest";
import type { FunderLocation } from "./constants";

/**
 * Minimal profile context for AI grant discovery (OpenAI / Gemini).
 */
export interface DiscoveryProfile {
  businessName: string;
  sector: string;
  description: string;
  location: string;
  fundingMin: number;
  fundingMax: number;
  fundingPurposes: string[];
  /** User-selected regions: US, UK, EU, Global. Empty = all. */
  funderLocations?: FunderLocation[];
}

/** Raw grant shape returned by discovery APIs (before normalisation). */
export interface DiscoveryGrantRow {
  name: string;
  funder: string;
  amount?: number | null;
  deadline?: string | null;
  applicationUrl: string;
  eligibility: string;
  sectors?: string[];
  regions?: string[];
}

const JSON_ARRAY_REGEX = /\[[\s\S]*\]/;

/**
 * Extract a JSON array from model output (strip markdown code blocks if present).
 */
export function parseJsonArray<T>(raw: string): T[] {
  const trimmed = raw.trim();
  const match = trimmed.match(JSON_ARRAY_REGEX);
  const jsonStr = match ? match[0] : trimmed;
  const parsed = JSON.parse(jsonStr) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed as T[];
}

/**
 * Normalise a discovery row to GrantInput and add source + externalId for dedupe.
 */
export function toGrantInput(
  row: DiscoveryGrantRow,
  source: "claude" | "openai" | "gemini",
  funderLocations?: string[]
): GrantInput | null {
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const funder = typeof row.funder === "string" ? row.funder.trim() : "";
  const applicationUrl = typeof row.applicationUrl === "string" ? row.applicationUrl.trim() : "";
  const eligibility = typeof row.eligibility === "string" ? row.eligibility.trim() : "See application page.";
  if (!name || !funder || !applicationUrl) return null;

  const amount =
    typeof row.amount === "number" && !Number.isNaN(row.amount)
      ? row.amount
      : null;
  const sectors = Array.isArray(row.sectors)
    ? row.sectors.filter((s): s is string => typeof s === "string")
    : ["Other"];
  const regions = Array.isArray(row.regions)
    ? row.regions.filter((r): r is string => typeof r === "string")
    : ["England"];
  const deadline =
    row.deadline && typeof row.deadline === "string"
      ? row.deadline
      : null;

  const slug = `${name}|${funder}`.replace(/[^a-zA-Z0-9|]/g, "-").slice(0, 120);
  const externalId = `discovery-${source}-${slug}`;

  return {
    externalId,
    source,
    name,
    funder,
    amount,
    deadline,
    applicationUrl,
    eligibility,
    sectors,
    regions,
    funderLocations: funderLocations?.length ? funderLocations : undefined,
  };
}
