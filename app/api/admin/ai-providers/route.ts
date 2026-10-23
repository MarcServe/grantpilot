import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin-auth";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { AI_PROVIDER_IDS } from "@/lib/ai-provider-catalog";
import { clearAIProviderSettingsCache, getAIProviderStatuses, getAIProviderConfig } from "@/lib/ai-provider-settings";
const schema = z.object({ provider: z.enum(AI_PROVIDER_IDS as [typeof AI_PROVIDER_IDS[number], ...typeof AI_PROVIDER_IDS[number][]]), apiKey: z.string().trim().min(8).max(4096).optional(), enabled: z.boolean(), reset: z.boolean().optional() });
const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin access required" }, { status: 403, headers });
  try { return NextResponse.json(await getAIProviderStatuses(), { headers }); }
  catch { return NextResponse.json({ error: "Could not load provider settings" }, { status: 502, headers }); }
}
export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin access required" }, { status: 403, headers });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return NextResponse.json({ error: "JSON content required" }, { status: 415, headers });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Cross-origin updates are not allowed" }, { status: 403, headers });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a provider and enter a valid API key (8–4,096 characters), or leave it blank to keep the current key." }, { status: 400, headers });
  const user = await getCurrentUser();
  const input = parsed.data;
  if (!input.reset && input.enabled && !input.apiKey) {
    try {
      if (!(await getAIProviderConfig(input.provider)).apiKey) return NextResponse.json({ error: "Add an API key before enabling this provider." }, { status: 400, headers });
    } catch { return NextResponse.json({ error: "Could not read provider settings. Please try again." }, { status: 502, headers }); }
  }
  const db = getSupabaseAdmin({ timeoutMs: 8000 });
  const { error } = input.reset ? await db.rpc("ai_provider_reset", { p_provider: input.provider })
    : await db.rpc("ai_provider_save", { p_provider: input.provider, p_api_key: input.apiKey ?? null, p_enabled: input.enabled, p_updated_by: user?.id ?? null });
  if (error) return NextResponse.json({ error: "Could not save provider settings. Ensure the AI provider settings migration has been applied in Supabase." }, { status: 502, headers });
  clearAIProviderSettingsCache();
  return NextResponse.json({ ok: true }, { headers });
}
