"use client";
import { useEffect, useState } from "react";
import { AI_PROVIDERS, AI_PROVIDER_IDS, type AIProvider } from "@/lib/ai-provider-catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
type Status = { provider: AIProvider; configured: boolean; enabled: boolean; source: string; hasOverride: boolean };
export function AIProviderSettings() {
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [keys, setKeys] = useState<Partial<Record<AIProvider, string>>>({});
  const [enabled, setEnabled] = useState<Partial<Record<AIProvider, boolean>>>({});
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<AIProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function refresh() {
    const res = await fetch("/api/admin/ai-providers", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not load provider settings");
    setStatuses(data.providers);
    setReady(data.storageReady);
    setEnabled(Object.fromEntries(data.providers.map((item: Status) => [item.provider, item.enabled])));
  }
  useEffect(() => { void refresh().catch((cause) => setError(cause.message)).finally(() => setLoading(false)); }, []);
  async function save(provider: AIProvider, reset = false) {
    setSaving(provider); setError(null);
    try {
      const res = await fetch("/api/admin/ai-providers", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: reset ? undefined : keys[provider]?.trim() || undefined, enabled: enabled[provider] ?? false, reset }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save settings");
      setKeys((current) => ({ ...current, [provider]: "" }));
      await refresh();
      toast.success(reset ? "Using environment defaults again" : "Provider saved. Runtime changes apply within 15 seconds.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save settings"); }
    finally { setSaving(null); }
  }
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Manage discovery keys and provider access here. Saved keys are encrypted and never shown again. Leave a key blank to keep its current value.</p>
    {loading && <p role="status" className="text-sm">Loading provider settings…</p>}
    {!loading && !ready && !error && <p role="status" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">One-time setup required: apply migration 069_ai_provider_settings.sql in Supabase. Existing environment keys continue to work.</p>}
    {error && <p role="alert" className="rounded-md border bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {AI_PROVIDER_IDS.map((provider) => {
      const meta = AI_PROVIDERS[provider]; const status = statuses.find((item) => item.provider === provider);
      return <form key={provider} className="space-y-3 rounded-lg border p-3" onSubmit={(event) => { event.preventDefault(); void save(provider); }}>
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-medium">{meta.label}</h3><p className="text-xs text-muted-foreground">{meta.detail}</p></div><span className="text-xs text-muted-foreground">{status ? `${status.configured ? status.enabled ? "Enabled" : "Discovery disabled" : "No key"} · ${status.source === "admin" ? "saved in admin" : status.source === "environment" ? "environment key" : "not configured"}` : "Loading…"}</span></div>
        <div className="space-y-1"><Label htmlFor={`provider-key-${provider}`} className="text-xs">{status?.configured ? "Replace API key (optional)" : "API key"}</Label><Input id={`provider-key-${provider}`} type="password" autoComplete="new-password" spellCheck={false} value={keys[provider] ?? ""} onChange={(event) => setKeys((current) => ({ ...current, [provider]: event.target.value }))} placeholder={status?.configured ? "Leave blank to keep the current key" : "Paste your API key"} disabled={!ready || saving !== null} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled[provider] ?? false} disabled={!ready || saving !== null} onChange={(event) => setEnabled((current) => ({ ...current, [provider]: event.target.checked }))} />Enable grant discovery</label>
        {provider === "openai" && <p className="text-xs text-muted-foreground">The saved OpenAI key also serves scoring and profile AI. This toggle controls discovery only.</p>}
        <div className="flex flex-wrap gap-2"><Button type="submit" size="sm" disabled={!ready || saving !== null}>{saving === provider ? "Saving…" : "Save provider"}</Button>{status?.hasOverride && <Button type="button" variant="outline" size="sm" disabled={!ready || saving !== null} onClick={() => void save(provider, true)}>Use environment defaults</Button>}</div>
      </form>;
    })}
  </div>;
}
