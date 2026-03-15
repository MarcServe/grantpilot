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
  userFunderLocations: string[] | undefined
): boolean {
  const user = userFunderLocations ?? [];
  if (user.length === 0) return true;
  const grant = grantFunderLocations ?? [];
  if (grant.length === 0) return true; // legacy grants without tag
  return grant.some((r) => user.includes(r));
}
