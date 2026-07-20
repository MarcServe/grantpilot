import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { FOUNDER_PACK_DOCUMENT_TYPES, generateFounderPack } from "@/lib/founder-pack";
import { recordUsage } from "@/lib/plan-check";
import { planAllowsForOrg, PLAN_CAPABILITY_MESSAGES } from "@/lib/plan-features";

const documentTypeValues = FOUNDER_PACK_DOCUMENT_TYPES.map((item) => item.value) as [
  (typeof FOUNDER_PACK_DOCUMENT_TYPES)[number]["value"],
  ...(typeof FOUNDER_PACK_DOCUMENT_TYPES)[number]["value"][],
];

const MAX_GRANT_CONTEXT_CHARS = 14_000;

const requestSchema = z.object({
  profileId: z.string().min(1),
  founderName: z.string().max(120).optional().default(""),
  founderRole: z.string().max(160).optional().default(""),
  founderBackground: z.string().min(20).max(4000),
  technicalContribution: z.string().min(20).max(4000),
  targetUse: z.enum(["innovator_founder_visa", "funding_readiness", "accelerator_investor"]).default("innovator_founder_visa"),
  documentTypes: z.array(z.enum(documentTypeValues)).min(1),
  marketFocus: z.string().min(10).max(2500),
  revenueModel: z.string().min(10).max(2500),
  pricingAssumptions: z.string().min(10).max(2500),
  hiringPlan: z.string().min(10).max(2500),
  additionalNotes: z.string().max(2500).optional(),
  selectedApplicationIds: z.array(z.string().min(1)).max(15).optional(),
  selectedEligibleGrantIds: z.array(z.string().min(1)).max(15).optional(),
  grantRequirementsNotes: z.string().max(8000).optional(),
});

function grantFromJoin(row: Record<string, unknown>): Record<string, unknown> {
  const grantRaw = row.Grant ?? row.grant;
  const g = Array.isArray(grantRaw) ? grantRaw[0] : grantRaw;
  return g && typeof g === "object" ? (g as Record<string, unknown>) : {};
}

function reasonsSnippet(reasons: unknown): string {
  if (!Array.isArray(reasons)) return "";
  return reasons
    .slice(0, 12)
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .join("; ")
    .slice(0, 1800);
}

function criteriaSnippet(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .slice(0, 14)
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .join("; ")
    .slice(0, 1400);
}

function formatApplicationGrantBlock(app: Record<string, unknown>): string {
  const g = grantFromJoin(app);
  const name = String(g.name ?? "Grant");
  const funder = String(g.funder ?? "").trim();
  const elig = String(g.eligibility ?? "").trim().slice(0, 4500);
  const desc = String(g.description ?? "").trim().slice(0, 2000);
  const obj = String(g.objectives ?? "").trim().slice(0, 2000);
  const lines = [
    `Source: workspace application`,
    `Application ID: ${String(app.id)} (status: ${String(app.status ?? "unknown")})`,
    `Grant ID: ${String(app.grantId ?? app.grant_id ?? "")}`,
    `Grant: ${name}`,
    funder ? `Funder: ${funder}` : "",
    elig ? `Published eligibility:\n${elig}` : "",
    desc ? `Description (excerpt):\n${desc}` : "",
    obj ? `Objectives (excerpt):\n${obj}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function formatEligibilityGrantBlock(row: Record<string, unknown>): string {
  const g = grantFromJoin(row);
  const name = String(g.name ?? "Grant");
  const funder = String(g.funder ?? "").trim();
  const elig = String(g.eligibility ?? "").trim().slice(0, 4500);
  const summary = String(row.summary ?? "").trim().slice(0, 2800);
  const decision = String(row.decision ?? "").trim();
  const score = row.score != null ? Number(row.score) : null;
  const reasons = reasonsSnippet(row.reasons);
  const missing = criteriaSnippet(row.missing_criteria);
  const met = criteriaSnippet(row.met_criteria);
  const lines = [
    `Source: eligibility match (no application started yet in GrantsCopilot)`,
    `Grant ID: ${String(row.grant_id ?? "")}`,
    `Grant: ${name}`,
    funder ? `Funder: ${funder}` : "",
    Number.isFinite(score) ? `Cached eligibility score: ${score}%` : "",
    decision ? `Assessment band: ${decision.replace(/_/g, " ")}` : "",
    summary ? `Assessment summary:\n${summary}` : "",
    reasons ? `Reasoning highlights:\n${reasons}` : "",
    met ? `Criteria appearing met:\n${met}` : "",
    missing ? `Gaps / work needed:\n${missing}` : "",
    elig ? `Published eligibility:\n${elig}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function formatStandaloneGrantBlock(grant: Record<string, unknown>): string {
  const name = String(grant.name ?? "Grant");
  const funder = String(grant.funder ?? "").trim();
  const elig = String(grant.eligibility ?? "").trim().slice(0, 4500);
  const desc = String(grant.description ?? "").trim().slice(0, 2500);
  const obj = String(grant.objectives ?? "").trim().slice(0, 2000);
  const deadline = grant.deadline ? `Deadline: ${String(grant.deadline)}` : "";
  const lines = [
    `Source: selected grant context`,
    `Grant ID: ${String(grant.id ?? "")}`,
    `Grant: ${name}`,
    funder ? `Funder: ${funder}` : "",
    deadline,
    elig ? `Published eligibility:\n${elig}` : "",
    desc ? `Description (excerpt):\n${desc}` : "",
    obj ? `Objectives (excerpt):\n${obj}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function assembleGrantContext(
  applications: Record<string, unknown>[],
  eligibilityRows: Record<string, unknown>[],
  standaloneGrants: Record<string, unknown>[],
  extraNotes?: string | null
): string | undefined {
  const parts: string[] = [];
  const coveredGrantIds = new Set<string>();

  for (const app of applications) {
    const gid = String(app.grantId ?? app.grant_id ?? "").trim();
    if (gid) coveredGrantIds.add(gid);
    parts.push(formatApplicationGrantBlock(app));
  }

  for (const row of eligibilityRows) {
    const gid = String(row.grant_id ?? "").trim();
    if (!gid) continue;
    if (coveredGrantIds.has(gid)) continue;
    coveredGrantIds.add(gid);
    parts.push(formatEligibilityGrantBlock(row));
  }

  for (const grant of standaloneGrants) {
    const gid = String(grant.id ?? "").trim();
    if (!gid || coveredGrantIds.has(gid)) continue;
    coveredGrantIds.add(gid);
    parts.push(formatStandaloneGrantBlock(grant));
  }

  const notes = extraNotes?.trim();
  if (notes) {
    parts.push(`Founder-supplied grant / funder requirements, form questions, or pasted criteria:\n${notes}`);
  }

  const joined = parts.filter(Boolean).join("\n\n---\n\n").trim();
  return joined.length > 0 ? joined : undefined;
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { org, orgId, user } = await getActiveOrg();
    if (!planAllowsForOrg(org, "founder_pack")) {
      return NextResponse.json(
        { error: PLAN_CAPABILITY_MESSAGES.founder_pack },
        { status: 402 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid pack inputs", details: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: profile, error: profileError } = await supabase
      .from("BusinessProfile")
      .select("*")
      .eq("id", parsed.data.profileId)
      .eq("organisationId", orgId)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 502 });
    }
    if (!profile) {
      return NextResponse.json({ error: "Business profile not found" }, { status: 404 });
    }

    const firstDirector = String((profile as Record<string, unknown>).directorNames ?? "")
      .split(/\n|,|;/)
      .map((item) => item.trim())
      .find(Boolean);
    const fallbackFounderName =
      parsed.data.founderName.trim() ||
      String((profile as Record<string, unknown>).primaryContactName ?? "").trim() ||
      firstDirector ||
      "Founder";
    const fallbackFounderRole =
      parsed.data.founderRole.trim() ||
      String((profile as Record<string, unknown>).primaryContactRole ?? "").trim() ||
      "Founder";
    const inputs = {
      ...parsed.data,
      founderName: fallbackFounderName,
      founderRole: fallbackFounderRole,
    };

    const profileId = inputs.profileId;
    const uniqueAppIds = [...new Set(inputs.selectedApplicationIds ?? [])];
    const uniqueEligGrantIds = [...new Set(inputs.selectedEligibleGrantIds ?? [])];

    let applicationRows: Record<string, unknown>[] = [];

    if (uniqueAppIds.length > 0) {
      const { data: appRows, error: appErr } = await supabase
        .from("Application")
        .select("id, status, profileId, grantId, Grant(id, name, funder, eligibility, description, objectives)")
        .eq("organisationId", orgId)
        .in("id", uniqueAppIds);

      if (appErr) {
        return NextResponse.json({ error: appErr.message }, { status: 502 });
      }
      const rows = (appRows ?? []) as Record<string, unknown>[];
      if (rows.length !== uniqueAppIds.length) {
        return NextResponse.json(
          { error: "One or more selected applications were not found or do not belong to your workspace." },
          { status: 400 }
        );
      }
      for (const row of rows) {
        const pid = String(row.profileId ?? row.profile_id ?? "");
        if (pid !== profileId) {
          return NextResponse.json(
            { error: "Each selected application must use the same business profile chosen above." },
            { status: 400 }
          );
        }
      }
      applicationRows = rows;
    }

    let eligibilityRows: Record<string, unknown>[] = [];

    if (uniqueEligGrantIds.length > 0) {
      const { data: eligData, error: eligErr } = await supabase
        .from("EligibilityAssessment")
        .select(
          "grant_id, profile_id, organisation_id, score, decision, summary, reasons, missing_criteria, met_criteria, Grant(id, name, funder, eligibility, description, objectives)"
        )
        .eq("organisation_id", orgId)
        .eq("profile_id", profileId)
        .in("grant_id", uniqueEligGrantIds);

      if (eligErr) {
        return NextResponse.json({ error: eligErr.message }, { status: 502 });
      }
      const rows = (eligData ?? []) as Record<string, unknown>[];
      eligibilityRows = rows;
    }

    const matchedEligibilityGrantIds = new Set(eligibilityRows.map((row) => String(row.grant_id ?? "").trim()).filter(Boolean));
    const standaloneGrantIds = uniqueEligGrantIds.filter((id) => !matchedEligibilityGrantIds.has(id));
    let standaloneGrantRows: Record<string, unknown>[] = [];
    if (standaloneGrantIds.length > 0) {
      const { data: grants, error: grantError } = await supabase
        .from("Grant")
        .select("id, name, funder, deadline, eligibility, description, objectives")
        .in("id", standaloneGrantIds);
      if (grantError) return NextResponse.json({ error: grantError.message }, { status: 502 });
      standaloneGrantRows = (grants ?? []) as Record<string, unknown>[];
    }

    const grantContext = assembleGrantContext(applicationRows, eligibilityRows, standaloneGrantRows, inputs.grantRequirementsNotes);

    const trimmedCtx = grantContext?.trim()
      ? grantContext.trim().slice(0, MAX_GRANT_CONTEXT_CHARS)
      : undefined;

    const content = await generateFounderPack(profile as Record<string, unknown>, inputs, trimmedCtx);
    const { data: pack, error: insertError } = await supabase
      .from("FounderFundingPack")
      .insert({
        organisationId: orgId,
        profileId: inputs.profileId,
        createdById: (user as { id?: string }).id ?? null,
        type: inputs.targetUse,
        status: "generated",
        inputs,
        content,
      })
      .select("id, createdAt, content")
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 502 });
    }

    await recordUsage(orgId, "founder_pack").catch(() => {});

    return NextResponse.json({ pack });
  } catch (e) {
    console.error("[FOUNDER_PACK_GENERATE]", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
