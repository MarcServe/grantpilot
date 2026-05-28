import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin-auth";
import { getCurrentUser } from "@/lib/auth";
import { grantSourceEndpointKey, normaliseGrantSourceEndpoint } from "@/lib/grant-source-endpoint";
import { getSupabaseAdmin } from "@/lib/supabase";

const sourceTypes = ["rss", "government_portal", "foundation", "newsletter"] as const;
const crawlFrequencies = ["6h", "24h", "72h", "168h"] as const;
const SOURCE_PAGE_SIZE = 20;

const sourceSchema = z.object({
  sourceName: z.string().trim().min(2).max(120),
  endpoint: z.string().trim().min(4).max(2000),
  country: z.string().trim().max(40).optional().nullable(),
  type: z.enum(sourceTypes),
  crawlFrequency: z.enum(crawlFrequencies).default("24h"),
  enabled: z.boolean().default(true),
  markDueNow: z.boolean().default(true),
});

const patchSchema = z.object({
  id: z.string().trim().min(1),
  enabled: z.boolean().optional(),
  markDueNow: z.boolean().optional(),
});

function defaultAdapter(type: (typeof sourceTypes)[number]): "rss" | "crawl" {
  return type === "rss" ? "rss" : "crawl";
}

function sourceIdForEndpoint(endpoint: string): string {
  const hash = createHash("sha256").update(grantSourceEndpointKey(endpoint)).digest("hex").slice(0, 20);
  return `manual-${hash}`;
}

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!(await isAdmin())) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

function normalizePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const page = normalizePage(new URL(request.url).searchParams.get("page"));
  const from = (page - 1) * SOURCE_PAGE_SIZE;
  const to = from + SOURCE_PAGE_SIZE - 1;
  const supabase = getSupabaseAdmin();
  const { data, error, count } = await supabase
    .from("grant_sources")
    .select("id, source_name, country, type, endpoint, crawl_frequency, enabled, last_crawled_at, adapter, updated_at", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    sources: data ?? [],
    page,
    pageSize: SOURCE_PAGE_SIZE,
    total: count ?? 0,
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let parsed: z.infer<typeof sourceSchema>;
  try {
    const body = await request.json();
    const result = sourceSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0]?.message ?? "Invalid source" }, { status: 400 });
    }
    parsed = result.data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let endpoint: string;
  try {
    endpoint = normaliseGrantSourceEndpoint(parsed.endpoint);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid URL" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const existingResult = await supabase
    .from("grant_sources")
    .select("id, endpoint");

  if (existingResult.error) {
    return NextResponse.json({ error: existingResult.error.message }, { status: 500 });
  }

  const endpointKey = grantSourceEndpointKey(endpoint);
  const existingId = (existingResult.data ?? []).find((row) =>
    typeof row.endpoint === "string" && grantSourceEndpointKey(row.endpoint) === endpointKey
  )?.id as string | undefined;
  const now = new Date().toISOString();
  const id = existingId ?? sourceIdForEndpoint(endpoint);
  const payload = {
    id,
    source_name: parsed.sourceName,
    country: parsed.country?.trim() || null,
    type: parsed.type,
    endpoint,
    crawl_frequency: parsed.crawlFrequency,
    enabled: parsed.enabled,
    adapter: defaultAdapter(parsed.type),
    updated_at: now,
    ...(parsed.markDueNow ? { last_crawled_at: null, last_content_hash: null } : {}),
  };

  const write = existingId
    ? await supabase.from("grant_sources").update(payload).eq("id", existingId).select("id").single()
    : await supabase.from("grant_sources").insert(payload).select("id").single();

  if (write.error) {
    return NextResponse.json({ error: write.error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    created: !existingId,
    id,
    message: existingId
      ? "Grant source updated and marked due for the next crawler run."
      : "Grant source added and marked due for the next crawler run.",
  });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let parsed: z.infer<typeof patchSchema>;
  try {
    const body = await request.json();
    const result = patchSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0]?.message ?? "Invalid source update" }, { status: 400 });
    }
    parsed = result.data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof parsed.enabled === "boolean") payload.enabled = parsed.enabled;
  if (parsed.markDueNow) {
    payload.last_crawled_at = null;
    payload.last_content_hash = null;
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("grant_sources")
    .update(payload)
    .eq("id", parsed.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Grant source updated." });
}
