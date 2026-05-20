import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildFounderPackTextSections, type FounderPackExportInput } from "@/lib/founder-pack-export";
import { sanitiseFounderPackContent, type FounderPackContent, type FounderPackDocumentType } from "@/lib/founder-pack";
import { planAllowsForOrg, PLAN_CAPABILITY_MESSAGES } from "@/lib/plan-features";

interface RouteContext {
  params: Promise<{ id: string }>;
}

type CanvaDatasetField = { type?: string };
type CanvaDataset = Record<string, CanvaDatasetField>;
type CanvaTextData = Record<string, { type: "text"; text: string }>;

const CANVA_API_BASE = process.env.CANVA_API_BASE ?? "https://api.canva.com/rest/v1";

export async function POST(_req: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { org, orgId } = await getActiveOrg();
    if (!planAllowsForOrg(org as { plan?: string; createdAt?: string | Date | null }, "founder_pack")) {
      return NextResponse.json(
        { error: PLAN_CAPABILITY_MESSAGES.founder_pack, code: "FEATURE_FORBIDDEN" },
        { status: 402 }
      );
    }

    const token = process.env.CANVA_ACCESS_TOKEN;
    const brandTemplateId = process.env.CANVA_PITCH_DECK_TEMPLATE_ID ?? process.env.CANVA_BRAND_TEMPLATE_ID;
    if (!token || !brandTemplateId) {
      return NextResponse.json(
        {
          error: "Canva is not configured",
          requiredEnv: ["CANVA_ACCESS_TOKEN", "CANVA_BRAND_TEMPLATE_ID or CANVA_PITCH_DECK_TEMPLATE_ID"],
        },
        { status: 501 }
      );
    }

    const { id } = await context.params;
    const pack = await loadPack(id, orgId);
    if (!pack) return NextResponse.json({ error: "Founder pack not found" }, { status: 404 });

    const datasetRes = await fetch(`${CANVA_API_BASE}/brand-templates/${encodeURIComponent(brandTemplateId)}/dataset`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const datasetBody = await datasetRes.json().catch(() => ({}));
    if (!datasetRes.ok) {
      return NextResponse.json(
        { error: "Could not read Canva brand template dataset", details: datasetBody },
        { status: datasetRes.status }
      );
    }

    const dataset = (datasetBody.dataset ?? {}) as CanvaDataset;
    const data = buildCanvaTextPayload(pack, dataset);
    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        {
          error: "No matching Canva autofill text fields were found on the selected brand template",
          expectedFields: Object.keys(buildCanvaFieldMap(pack)),
          templateFields: Object.keys(dataset),
        },
        { status: 422 }
      );
    }

    const createRes = await fetch(`${CANVA_API_BASE}/autofills`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        brand_template_id: brandTemplateId,
        title: `${pack.profile?.businessName ?? "Founder Pack"} pitch deck`,
        data,
      }),
    });
    const createBody = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      return NextResponse.json(
        { error: "Could not create Canva autofill job", details: createBody },
        { status: createRes.status }
      );
    }

    const jobId = createBody.job?.id;
    if (!jobId) return NextResponse.json({ error: "Canva did not return a job id", details: createBody }, { status: 502 });

    const job = await pollCanvaJob(token, jobId);
    return NextResponse.json({ jobId, job, autofilledFields: Object.keys(data) });
  } catch (e) {
    console.error("[FOUNDER_PACK_CANVA]", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function loadPack(id: string, orgId: string): Promise<FounderPackExportInput | null> {
  const supabase = getSupabaseAdmin();
  const { data: pack, error: packError } = await supabase
    .from("FounderFundingPack")
    .select("id, organisationId, profileId, type, inputs, content, createdAt")
    .eq("id", id)
    .eq("organisationId", orgId)
    .maybeSingle();
  if (packError) throw new Error(packError.message);
  if (!pack) return null;

  const { data: profile, error: profileError } = await supabase
    .from("BusinessProfile")
    .select("businessName, sector")
    .eq("id", String(pack.profileId))
    .eq("organisationId", orgId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);

  const inputs = pack.inputs && typeof pack.inputs === "object" && !Array.isArray(pack.inputs)
    ? (pack.inputs as Record<string, unknown>)
    : {};

  const businessName = String(profile?.businessName ?? "Founder Pack");
  return {
    id: String(pack.id),
    createdAt: String(pack.createdAt ?? ""),
    type: String(pack.type ?? ""),
    inputs: {
      founderName: String(inputs.founderName ?? ""),
      founderRole: String(inputs.founderRole ?? ""),
      documentTypes: Array.isArray(inputs.documentTypes)
        ? inputs.documentTypes.map((item) => String(item) as FounderPackDocumentType)
        : undefined,
    },
    content: sanitiseFounderPackContent(pack.content as FounderPackContent, { businessName }),
    profile: {
      businessName,
      sector: String(profile?.sector ?? ""),
    },
  };
}

function buildCanvaFieldMap(pack: FounderPackExportInput): Record<string, string> {
  const fields: Record<string, string> = {
    TITLE: `${pack.profile?.businessName ?? "Founder Pack"} pitch deck`,
    SUBTITLE: "Autonomous funding infrastructure",
    BUSINESS_NAME: pack.profile?.businessName ?? "",
    SECTOR: pack.profile?.sector ?? "",
    FOUNDER_NAME: pack.inputs?.founderName ?? "",
    FOUNDER_ROLE: pack.inputs?.founderRole ?? "",
    EXECUTIVE_SUMMARY: pack.content.executiveSummary ?? "",
    INNOVATION_STATEMENT: pack.content.innovationStatement ?? "",
    MARKET_ANALYSIS: pack.content.marketAnalysis ?? "",
  };
  const slides = pack.content.pitchDeck?.length
    ? pack.content.pitchDeck
    : buildFounderPackTextSections(pack).slice(0, 12).map((section) => ({
        title: section.title,
        objective: "",
        bullets: section.lines.slice(0, 5),
        speakerNotes: "",
        visualDirection: "",
      }));

  slides.slice(0, 12).forEach((slide, index) => {
    const n = index + 1;
    fields[`SLIDE_${n}_TITLE`] = slide.title;
    fields[`SLIDE_${n}_OBJECTIVE`] = slide.objective;
    fields[`SLIDE_${n}_BULLETS`] = slide.bullets.join("\n");
    fields[`SLIDE_${n}_NOTES`] = slide.speakerNotes;
    fields[`SLIDE_${n}_VISUAL`] = slide.visualDirection;
  });

  return fields;
}

function buildCanvaTextPayload(pack: FounderPackExportInput, dataset: CanvaDataset): CanvaTextData {
  const fieldMap = buildCanvaFieldMap(pack);
  const payload: CanvaTextData = {};
  Object.entries(dataset).forEach(([key, field]) => {
    if (field.type !== "text") return;
    const value = fieldMap[key] ?? fieldMap[key.toUpperCase()];
    if (value) payload[key] = { type: "text", text: value.slice(0, 5000) };
  });
  return payload;
}

async function pollCanvaJob(token: string, jobId: string): Promise<unknown> {
  let latest: unknown = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
    const res = await fetch(`${CANVA_API_BASE}/autofills/${encodeURIComponent(jobId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    latest = await res.json().catch(() => ({}));
    const status = (latest as { job?: { status?: string } })?.job?.status;
    if (!res.ok || status === "success" || status === "failed") return latest;
  }
  return latest;
}
