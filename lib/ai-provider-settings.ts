// Server-only: never import this module from a client component.
import { AI_PROVIDERS, type AIProvider } from "@/lib/ai-provider-catalog";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getServerCache, clearServerCache } from "@/lib/server-cache";

type StoredConfig = { api_key: string | null; enabled: boolean | null; updated_at?: string };
export function resolveAIProvider(provider: AIProvider, stored: StoredConfig | null, env: Record<string, string | undefined>) {
  const meta = AI_PROVIDERS[provider];
  const environmentKey = meta.keyEnv.map((name) => env[name]?.trim()).find(Boolean) ?? null;
  const apiKey = stored?.api_key?.trim() || environmentKey;
  const environmentEnabled = meta.enableEnv.length === 0 || meta.enableEnv.some((name) => ["1", "true", "yes", "on", "enabled"].includes((env[name] ?? "").trim().toLowerCase()));
  return { apiKey, enabled: stored?.enabled ?? environmentEnabled,
    source: stored?.api_key ? "admin" as const : environmentKey ? "environment" as const : "none" as const };
}
function missingStorage(code?: string) { return ["PGRST202", "PGRST205", "42P01", "42883"].includes(code ?? ""); }
export async function getAIProviderConfig(provider: AIProvider) {
  return getServerCache(`ai-provider-config:${provider}`, { ttlMs: 15_000 }, async () => {
    const { data, error } = await getSupabaseAdmin({ timeoutMs: 8000 }).rpc("ai_provider_read", { p_provider: provider });
    if (error && !missingStorage(error.code)) throw new Error("Could not load AI provider configuration");
    const stored = !error && Array.isArray(data) ? data[0] as StoredConfig | undefined : undefined;
    return resolveAIProvider(provider, stored ?? null, process.env);
  });
}
export async function getAIProviderKey(provider: AIProvider, discoveryOnly = false): Promise<string | null> {
  const config = await getAIProviderConfig(provider);
  return discoveryOnly && !config.enabled ? null : config.apiKey;
}
export function clearAIProviderSettingsCache() { clearServerCache("ai-provider-config:"); }
export async function getAIProviderStatuses() {
  const { data, error } = await getSupabaseAdmin({ timeoutMs: 8000 }).from("ai_provider_settings")
    .select("provider,enabled,vault_secret_id,updated_at");
  if (error && !missingStorage(error.code)) throw new Error("Could not load provider settings");
  const rows = (data ?? []) as Array<{ provider: string; enabled: boolean; vault_secret_id: string | null; updated_at: string }>;
  return { storageReady: !error, providers: Object.entries(AI_PROVIDERS).map(([provider, meta]) => {
    const row = rows.find((item) => item.provider === provider);
    const config = resolveAIProvider(provider as AIProvider, row ? { api_key: row.vault_secret_id ? "stored" : null, enabled: row.enabled } : null, process.env);
    return { provider, label: meta.label, detail: meta.detail, configured: Boolean(config.apiKey), enabled: config.enabled,
      source: config.source, hasOverride: Boolean(row), updatedAt: row?.updated_at ?? null };
  }) };
}
