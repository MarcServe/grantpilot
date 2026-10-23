/** Preserve new readiness fields on databases awaiting migration 063. */
const MARKER = "\n\n[GrantsCopilot readiness metadata]\n";
export const READINESS_COMPAT_FIELDS = ["fundingUrgency", "fundingPosition", "documentReadiness", "previousGrantHistory"] as const;

export function restoreReadinessMetadata<T extends Record<string, unknown>>(profile: T): T {
  const raw = typeof profile.fundingDetails === "string" ? profile.fundingDetails : "";
  const index = raw.lastIndexOf(MARKER);
  if (index < 0) return profile;
  try {
    const metadata = JSON.parse(raw.slice(index + MARKER.length));
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return profile;
    const restored: Record<string, unknown> = { ...profile, fundingDetails: raw.slice(0, index) };
    for (const field of READINESS_COMPAT_FIELDS) {
      if (typeof metadata[field] === "string" && !restored[field]) restored[field] = metadata[field];
    }
    return restored as T;
  } catch {
    return profile;
  }
}

export function preserveReadinessMetadata(details: string | null, metadata: Record<string, unknown>): string {
  const values = Object.fromEntries(READINESS_COMPAT_FIELDS
    .filter((field) => typeof metadata[field] === "string" && String(metadata[field]).trim())
    .map((field) => [field, metadata[field]]));
  return `${details ?? ""}${MARKER}${JSON.stringify(values)}`;
}

export function missingReadinessColumn(error: { code?: string; message: string }): string | undefined {
  if (error.code !== "PGRST204" && error.code !== "42703") return undefined;
  return READINESS_COMPAT_FIELDS.find((field) => error.message.includes(`'${field}'`) || error.message.includes(`"${field}"`) || error.message.includes(`.${field} does not exist`));
}
