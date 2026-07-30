/**
 * Funder location / region codes used for filtering.
 * US = USA-only funders, UK = UK funders, EU = European Union, CA = Canada, AU = Australia, Global = open to multiple regions.
 */
export const FUNDER_LOCATIONS = ["US", "UK", "EU", "CA", "AU", "Global"] as const;
export type FunderLocation = (typeof FUNDER_LOCATIONS)[number];

export const FUNDER_LOCATION_LABELS: Record<FunderLocation, string> = {
  US: "United States",
  UK: "United Kingdom",
  EU: "Europe (EU)",
  CA: "Canada",
  AU: "Australia",
  Global: "Global",
};

export function normalizeFunderLocation(value: string | null | undefined): FunderLocation | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (FUNDER_LOCATIONS.includes(raw as FunderLocation)) return raw as FunderLocation;

  const normalised = raw.toLowerCase();
  if (/\b(uk|united kingdom|england|scotland|wales|northern ireland|britain|great britain)\b/.test(normalised)) return "UK";
  if (/\b(us|usa|u\.s\.|united states|america|united states of america)\b/.test(normalised)) return "US";
  if (/\b(eu|europe|european union)\b/.test(normalised)) return "EU";
  if (/\b(canada|canadian)\b/.test(normalised)) return "CA";
  if (/\b(australia|australian)\b/.test(normalised)) return "AU";
  if (/\b(global|international|worldwide)\b/.test(normalised)) return "Global";
  return null;
}

export function normalizeFunderLocations(values: string[] | undefined | null): FunderLocation[] {
  const result: FunderLocation[] = [];
  for (const value of values ?? []) {
    const normalised = normalizeFunderLocation(value);
    if (normalised && !result.includes(normalised)) result.push(normalised);
  }
  return result;
}

/**
 * Returns true if a grant should be shown given the user's selected funder locations.
 * - No user selection (empty) → show all grants.
 * - Grant has no funderLocations (legacy) → show to everyone.
 * - Otherwise show only when there is at least one overlap.
 */
export function grantMatchesFunderLocations(
  grantFunderLocations: string[] | undefined,
  userFunderLocations: string[] | undefined,
  options?: { allowUnknownGrantLocation?: boolean }
): boolean {
  const user = normalizeFunderLocations(userFunderLocations);
  if (user.length === 0) return true;
  const grant = normalizeFunderLocations(grantFunderLocations);
  if (grant.length === 0) return options?.allowUnknownGrantLocation !== false;
  if (grant.includes("Global")) return true;
  return grant.some((r) => user.includes(r));
}

export function inferFunderLocationsFromProfile(profile?: {
  funderLocations?: string[] | null;
  location?: string | null;
  country?: string | null;
  region?: string | null;
  localAuthority?: string | null;
  areasServed?: string | null;
} | null): FunderLocation[] {
  const explicit = normalizeFunderLocations(profile?.funderLocations);
  if (explicit?.length) return explicit;

  const text = `${profile?.country ?? ""} ${profile?.region ?? ""} ${profile?.location ?? ""} ${profile?.localAuthority ?? ""} ${profile?.areasServed ?? ""}`.toLowerCase();
  if (/\b(uk|united kingdom|england|scotland|wales|northern ireland|london|bristol|manchester|birmingham|leeds|cardiff|edinburgh|glasgow|belfast)\b/.test(text)) {
    return ["UK"];
  }
  if (/\b(us|usa|u\.s\.|united states|america|new york|california|texas|florida)\b/.test(text)) {
    return ["US"];
  }
  if (/\b(eu|europe|european union|germany|france|spain|italy|netherlands|ireland|belgium|sweden|denmark)\b/.test(text)) {
    return ["EU"];
  }
  if (/\b(canada|ontario|toronto|vancouver|quebec)\b/.test(text)) {
    return ["CA"];
  }
  if (/\b(australia|sydney|melbourne|queensland|victoria)\b/.test(text)) {
    return ["AU"];
  }
  return [];
}
