import { getSupabaseAdmin } from "@/lib/supabase";

export const SCOUT_MODE_KEY = "scout_mode";

export type ScoutMode = "off" | "regex" | "full";

export function parseScoutMode(raw: string | null | undefined): ScoutMode | null {
  const v = (raw ?? "").toLowerCase().trim();
  if (v === "off" || v === "regex" || v === "full") return v;
  return null;
}

/** Default when DB has no override (matches worker env default). */
export function scoutModeFromEnv(): ScoutMode {
  const raw = (process.env.SCOUT_MODE ?? "full").toLowerCase().trim();
  return parseScoutMode(raw) ?? "full";
}

/**
 * Stored scout mode in DB, or null if admin has not set an override.
 */
export async function getStoredScoutMode(): Promise<ScoutMode | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("worker_settings")
    .select("value")
    .eq("key", SCOUT_MODE_KEY)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as { value?: string };
  return parseScoutMode(row.value);
}

/**
 * Effective mode: database wins when set; otherwise env default.
 */
export async function getEffectiveScoutMode(): Promise<ScoutMode> {
  const stored = await getStoredScoutMode();
  if (stored) return stored;
  return scoutModeFromEnv();
}

export async function setScoutMode(mode: ScoutMode): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("worker_settings").upsert(
    {
      key: SCOUT_MODE_KEY,
      value: mode,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  if (error) throw new Error(error.message);
}

/**
 * Remove DB override so the worker uses SCOUT_MODE from Fly.io env only.
 */
export async function clearScoutModeOverride(): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from("worker_settings").delete().eq("key", SCOUT_MODE_KEY);
}
