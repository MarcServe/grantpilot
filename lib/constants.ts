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
  const user = userFunderLocations ?? [];
  if (user.length === 0) return true;
  const grant = grantFunderLocations ?? [];
  if (grant.length === 0) return options?.allowUnknownGrantLocation !== false;
  if (grant.includes("Global")) return true;
  return grant.some((r) => user.includes(r));
}

export function inferFunderLocationsFromProfile(profile?: {
  funderLocations?: string[] | null;
  location?: string | null;
  country?: string | null;
  region?: string | null;
} | null): FunderLocation[] {
  const explicit = profile?.funderLocations?.filter((value): value is FunderLocation =>
    FUNDER_LOCATIONS.includes(value as FunderLocation)
  );
  if (explicit?.length) return explicit;

  const text = `${profile?.country ?? ""} ${profile?.region ?? ""} ${profile?.location ?? ""}`.toLowerCase();
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
