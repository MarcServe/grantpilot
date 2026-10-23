import type { getSupabaseAdmin } from "@/lib/supabase";

type Pack = { id: string; inputs?: unknown; profileId?: string };
function inputRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function ids(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0))].slice(0, 15) : [];
}
export function founderPackLabel(inputs: unknown, applications = new Map<string, string>(), grants = new Map<string, string>()): string {
  const input = inputRecord(inputs);
  if (typeof input.packName === "string" && input.packName.trim()) return input.packName.trim().slice(0, 240);
  const appIds = ids(input.selectedApplicationIds);
  const grantIds = ids(input.selectedEligibleGrantIds);
  const names = [...new Set([...appIds.map(id => applications.get(id)), ...grantIds.map(id => grants.get(id))].filter((name): name is string => !!name))];
  if (names.length) return `${appIds.length ? "Application" : "Grant"} — ${names[0]}${names.length > 1 ? ` + ${names.length - 1} more` : ""}`.slice(0, 240);
  if (appIds.length) return "Application pack — linked application unavailable";
  if (grantIds.length) return "Grant pack — linked grant unavailable";
  return "Generic funding pack";
}

/** Resolve legacy pack links in batches, scoped to the owning organisation. */
export async function loadFounderPackLabels(db: ReturnType<typeof getSupabaseAdmin>, organisationId: string, packs: Pack[]) {
  const appIds = [...new Set(packs.flatMap(pack => ids(inputRecord(pack.inputs).selectedApplicationIds)))];
  const grantIds = [...new Set(packs.flatMap(pack => ids(inputRecord(pack.inputs).selectedEligibleGrantIds)))];
  const [appResult, grantResult] = await Promise.all([
    appIds.length ? db.from("Application").select("id, Grant(name)").eq("organisationId", organisationId).in("id", appIds) : Promise.resolve({ data: [], error: null }),
    grantIds.length ? db.from("Grant").select("id, name").in("id", grantIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const applications = new Map<string, string>();
  for (const row of appResult.data ?? []) {
    const raw = row.Grant as unknown;
    const grant = (Array.isArray(raw) ? raw[0] : raw) as { name?: string } | null;
    if (grant?.name) applications.set(row.id, grant.name);
  }
  const grants = new Map((grantResult.data ?? []).map(row => [row.id, row.name]));
  return new Map(packs.map(pack => [pack.id, founderPackLabel(pack.inputs, applications, grants)]));
}
