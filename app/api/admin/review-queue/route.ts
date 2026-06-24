import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin-auth";
import { getCurrentUser } from "@/lib/auth";
import { grantSourceEndpointKey, normaliseGrantSourceEndpoint } from "@/lib/grant-source-endpoint";
import { getSupabaseAdmin } from "@/lib/supabase";
import { classifyGrantApplicationUrl } from "@/lib/grant-application-url-quality";

const sourceTypes = ["rss", "government_portal", "foundation", "newsletter"] as const;
const crawlFrequencies = ["6h", "24h", "72h", "168h"] as const;

const actionSchema = z.object({
  id: z.string().trim().min(1),
  action: z.enum(["approve_source", "approve_application_link", "reject"]),
  endpoint: z.string().trim().min(4).max(2000).optional(),
  reason: z.string().trim().max(1000).optional(),
});

type QueueRow = {
  id: string;
  kind: string;
  source_name: string | null;
  endpoint: string | null;
  country: string | null;
  source_type: string | null;
  crawl_frequency: string | null;
  grant_id: string | null;
  grant_link_id: number | null;
  payload: Record<string, unknown> | null;
};

function sourceIdForEndpoint(endpoint: string): string {
  const hash = createHash("sha256").update(grantSourceEndpointKey(endpoint)).digest("hex").slice(0, 20);
  return `review-${hash}`;
}

function defaultAdapter(type: (typeof sourceTypes)[number]): "rss" | "crawl" {
  return type === "rss" ? "rss" : "crawl";
}

function validSourceType(value: string | null | undefined): (typeof sourceTypes)[number] {
  return sourceTypes.includes(value as (typeof sourceTypes)[number])
    ? value as (typeof sourceTypes)[number]
    : "government_portal";
}

function validCrawlFrequency(value: string | null | undefined): (typeof crawlFrequencies)[number] {
  return crawlFrequencies.includes(value as (typeof crawlFrequencies)[number])
    ? value as (typeof crawlFrequencies)[number]
    : "24h";
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

async function markReviewed(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  id: string,
  status: "approved" | "rejected",
  reviewedBy: string
) {
  const payload: Record<string, unknown> = {
    status,
    reviewed_by: reviewedBy,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  return supabase.from("grant_source_review_queue").update(payload).eq("id", id);
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let parsed: z.infer<typeof actionSchema>;
  try {
    const body = await request.json();
    const result = actionSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0]?.message ?? "Invalid action" }, { status: 400 });
    }
    parsed = result.data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: queueRow, error: queueError } = await supabase
    .from("grant_source_review_queue")
    .select("id, kind, source_name, endpoint, country, source_type, crawl_frequency, grant_id, grant_link_id, payload")
    .eq("id", parsed.id)
    .maybeSingle();

  if (queueError) return NextResponse.json({ error: queueError.message }, { status: 500 });
  if (!queueRow) return NextResponse.json({ error: "Review queue row not found." }, { status: 404 });

  const row = queueRow as QueueRow;
  const reviewedBy = auth.user.id ?? auth.user.email ?? "admin";

  if (parsed.action === "reject") {
    const { error } = await markReviewed(supabase, row.id, "rejected", reviewedBy);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, message: "Review row rejected." });
  }

  if (parsed.action === "approve_source") {
    if (row.kind !== "source_candidate") {
      return NextResponse.json({ error: "This row is not a source candidate." }, { status: 400 });
    }

    let endpoint: string;
    try {
      endpoint = normaliseGrantSourceEndpoint(parsed.endpoint ?? row.endpoint ?? "");
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid endpoint." }, { status: 400 });
    }

    const sourceName = row.source_name?.trim() || String(row.payload?.sourceName ?? row.payload?.source_name ?? endpoint);
    const sourceType = validSourceType(row.source_type);
    const crawlFrequency = validCrawlFrequency(row.crawl_frequency);
    const id = sourceIdForEndpoint(endpoint);
    const endpointKey = grantSourceEndpointKey(endpoint);
    const existingResult = await supabase.from("grant_sources").select("id, endpoint");
    if (existingResult.error) return NextResponse.json({ error: existingResult.error.message }, { status: 500 });
    const existingId = ((existingResult.data ?? []) as { id: string; endpoint: string | null }[]).find((source) =>
      source.endpoint && grantSourceEndpointKey(source.endpoint) === endpointKey
    )?.id;
    const now = new Date().toISOString();
    const sourcePayload = {
      id: existingId ?? id,
      source_name: sourceName,
      endpoint,
      country: row.country ?? null,
      type: sourceType,
      crawl_frequency: crawlFrequency,
      enabled: true,
      adapter: defaultAdapter(sourceType),
      last_crawled_at: null,
      last_content_hash: null,
      updated_at: now,
    };

    const write = existingId
      ? await supabase.from("grant_sources").update(sourcePayload).eq("id", existingId)
      : await supabase.from("grant_sources").insert(sourcePayload);
    if (write.error) return NextResponse.json({ error: write.error.message }, { status: 500 });

    const { error } = await markReviewed(supabase, row.id, "approved", reviewedBy);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      created: !existingId,
      id: existingId ?? id,
      message: "Source approved and marked due for the crawler.",
    });
  }

  if (parsed.action === "approve_application_link") {
    if (row.kind !== "application_link" || !row.grant_id) {
      return NextResponse.json({ error: "This row is not an application-link review candidate." }, { status: 400 });
    }

    let endpoint: string;
    try {
      endpoint = normaliseGrantSourceEndpoint(parsed.endpoint ?? row.endpoint ?? "");
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid application URL." }, { status: 400 });
    }

    const classification = classifyGrantApplicationUrl(endpoint);
    if (classification.quality !== "verified_direct" && classification.quality !== "verified_portal") {
      return NextResponse.json(
        { error: `This does not look like a direct application form or portal start: ${classification.reason}` },
        { status: 400 }
      );
    }

    const [grantUpdate, linkUpdate] = await Promise.all([
      supabase
        .from("Grant")
        .update({
          applicationUrl: endpoint,
          directApplicationUrl: endpoint,
          applicationUrlKind: classification.kind,
          applicationUrlQuality: classification.quality,
          applicationUrlConfidence: classification.confidence,
          applicationUrlQualityReason: classification.reason,
          applicationUrlVerifiedAt: new Date().toISOString(),
          url_status: "unknown",
          url_checked_at: null,
        })
        .eq("id", row.grant_id),
      row.grant_link_id
        ? supabase
            .from("grant_links")
            .update({
              application_form_url: endpoint,
              status: "found",
              filed_by_worker: false,
              error_message: null,
              discovered_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.grant_link_id)
        : Promise.resolve({ error: null }),
    ]);

    if (grantUpdate.error) return NextResponse.json({ error: grantUpdate.error.message }, { status: 500 });
    if (linkUpdate.error) return NextResponse.json({ error: linkUpdate.error.message }, { status: 500 });

    const { error } = await markReviewed(supabase, row.id, "approved", reviewedBy);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, message: "Application link approved and saved on the grant." });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
