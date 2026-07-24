import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { analyseWebsite } from "@/lib/website-intelligence";
import { syncGrantMemoryFromProfile } from "@/lib/grant-memory";
import { requestEligibilityRefresh, requestProfileEligibilityBackfill } from "@/lib/eligibility-refresh-trigger";
import { generateAndStoreProfileEmbedding } from "@/lib/embeddings";
import { planAllowsForOrg, PLAN_CAPABILITY_MESSAGES } from "@/lib/plan-features";

const PROFILE_DNA_FIELDS = {
  sector: "Sector",
  missionStatement: "Mission statement",
  description: "Business description",
  fundingDetails: "Funding use summary",
  socialImpact: "Social impact",
  innovationCapabilities: "Innovation and R&D",
  sustainabilityInitiatives: "Sustainability initiatives",
  communityEngagement: "Community engagement",
  keyAchievements: "Key achievements",
  teamExpertise: "Team expertise",
  projectSummary: "Project summary",
  problemStatement: "Problem statement",
  proposedSolution: "Proposed solution",
  projectObjectives: "Project objectives",
  expectedOutcomes: "Expected outcomes",
  milestones: "Milestones",
  deliverables: "Deliverables",
  partnerOrganisations: "Partner organisations",
  collaborationDetails: "Collaboration details",
  projectSustainabilityPlan: "Project sustainability plan",
} as const;

type ProfileDnaField = keyof typeof PROFILE_DNA_FIELDS;

const applySchema = z.object({
  updates: z.record(z.string(), z.string().min(1)).default({}),
});

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  return new OpenAI({ apiKey });
}

function profileText(profile: Record<string, unknown>): string {
  const keys = [
    "businessName",
    "businessType",
    "sector",
    "missionStatement",
    "description",
    "location",
    "fundingMin",
    "fundingMax",
    "fundingPurposes",
    "fundingDetails",
    "socialImpact",
    "innovationCapabilities",
    "sustainabilityInitiatives",
    "communityEngagement",
    "keyAchievements",
    "directorNames",
    "directorProfiles",
    "teamMembers",
    "teamExpertise",
    "boardMembers",
    "founderBackground",
  ];
  return keys
    .map((key) => `${key}: ${Array.isArray(profile[key]) ? (profile[key] as unknown[]).join(", ") : String(profile[key] ?? "")}`)
    .join("\n");
}

function parseSuggestions(raw: string): {
  field: ProfileDnaField;
  label: string;
  value: string;
  confidence?: number;
  reason?: string;
}[] {
  const cleaned = raw.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?\s*```$/, "").trim();
  const parsed = JSON.parse(cleaned) as unknown;
  const list = Array.isArray((parsed as { suggestions?: unknown }).suggestions)
    ? (parsed as { suggestions: unknown[] }).suggestions
    : Array.isArray(parsed)
      ? parsed
      : [];
  return list
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const field = row.field;
      const value = typeof row.value === "string" ? row.value.trim() : "";
      if (typeof field !== "string" || !(field in PROFILE_DNA_FIELDS) || value.length < 8) return null;
      return {
        field: field as ProfileDnaField,
        label: PROFILE_DNA_FIELDS[field as ProfileDnaField],
        value,
        confidence: typeof row.confidence === "number" ? row.confidence : undefined,
        reason: typeof row.reason === "string" ? row.reason : undefined,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item != null);
}

async function recalcCompletionScore(profileId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: profile } = await supabase
    .from("BusinessProfile")
    .select("businessName, location, sector, missionStatement, description, employeeCount, annualRevenue, fundingMin, fundingMax, fundingPurposes")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) return;
  const { count } = await supabase
    .from("Document")
    .select("id", { count: "exact", head: true })
    .eq("profileId", profileId);

  let score = 0;
  if (profile.businessName?.trim()) score++;
  if (profile.location?.trim()) score++;
  if (profile.sector?.trim()) score++;
  if (profile.missionStatement?.trim()) score++;
  if (profile.description?.trim()) score++;
  if (profile.employeeCount != null) score++;
  if (profile.annualRevenue != null) score++;
  if (profile.fundingMin != null && Number(profile.fundingMin) >= 0) score++;
  if (profile.fundingMax != null && Number(profile.fundingMax) >= 0) score++;
  if (Array.isArray(profile.fundingPurposes) && profile.fundingPurposes.length > 0) score++;
  if ((count ?? 0) >= 1) score++;

  await supabase
    .from("BusinessProfile")
    .update({ completionScore: Math.round((score / 11) * 100) })
    .eq("id", profileId);
}

async function getProfileForOrg(orgId: string, profileId: string): Promise<Record<string, unknown> | null> {
  const { data } = await getSupabaseAdmin()
    .from("BusinessProfile")
    .select("*")
    .eq("id", profileId)
    .eq("organisationId", orgId)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

export async function POST(): Promise<NextResponse> {
  try {
    const { orgId, org, profile: activeProfile } = await getActiveOrg();
    if (!planAllowsForOrg(org, "website_intelligence_refresh")) {
      return NextResponse.json(
        { error: PLAN_CAPABILITY_MESSAGES.website_intelligence_refresh, code: "FEATURE_FORBIDDEN" },
        { status: 402 }
      );
    }
    if (!activeProfile?.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const supabase = getSupabaseAdmin();
    const profile = await getProfileForOrg(orgId, activeProfile.id);
    if (!profile?.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    let websiteIntelligence = typeof profile.websiteIntelligence === "string" ? profile.websiteIntelligence : "";
    const websiteUrl = typeof profile.websiteUrl === "string" ? profile.websiteUrl : "";
    if (!websiteIntelligence && websiteUrl) {
      websiteIntelligence = await analyseWebsite(websiteUrl).catch((error) => {
        const detail = error instanceof Error ? error.message : "Website analysis failed";
        return `Website URL: ${websiteUrl}

Website analysis note: ${detail}

The website could not be extracted reliably. Use the current business profile below as the primary source. Do not invent facts that are not present in the profile.`;
      });
      await supabase.from("BusinessProfile").update({ websiteIntelligence }).eq("id", profile.id as string);
    }
    if (!websiteIntelligence) {
      return NextResponse.json(
        { error: "Add a company website URL first so Company DNA can analyse it." },
        { status: 400 }
      );
    }

    const openai = getOpenAI();
    const fields = Object.entries(PROFILE_DNA_FIELDS)
      .map(([field, label]) => `- ${field}: ${label}`)
      .join("\n");
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 2600,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: `Use the company website intelligence and current profile to suggest factual profile updates for grant applications.

Only suggest fields supported by the app. Do not invent awards, revenue, partners, certifications, dates, metrics, or team facts. Prefer concise grant-ready language based on evidence from the website intelligence.

Supported fields:
${fields}

Current profile:
${profileText(profile)}

Company DNA / website intelligence:
${websiteIntelligence}

Return JSON only:
{
  "suggestions": [
    {
      "field": "one supported field key",
      "value": "grant-ready profile text",
      "confidence": 0.0-1.0,
      "reason": "short reason based on company DNA"
    }
  ]
}

Return 5-12 high-value suggestions. Avoid fields where the current profile already has strong, specific content unless the suggested value is materially better.`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "{\"suggestions\":[]}";
    return NextResponse.json({ suggestions: parseSuggestions(raw) });
  } catch (e) {
    console.error("[PROFILE_COMPANY_DNA]", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request): Promise<NextResponse> {
  try {
    const { orgId, org, profile: activeProfile } = await getActiveOrg();
    if (!planAllowsForOrg(org, "website_intelligence_refresh")) {
      return NextResponse.json(
        { error: PLAN_CAPABILITY_MESSAGES.website_intelligence_refresh, code: "FEATURE_FORBIDDEN" },
        { status: 402 }
      );
    }
    if (!activeProfile?.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = applySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid updates" }, { status: 400 });
    }

    const updates: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.data.updates)) {
      if (key in PROFILE_DNA_FIELDS && value.trim().length > 0) {
        updates[key] = value.trim();
      }
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Select at least one suggestion to apply" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const profile = await getProfileForOrg(orgId, activeProfile.id);
    if (!profile?.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const { error } = await supabase
      .from("BusinessProfile")
      .update(updates)
      .eq("id", profile.id as string);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    await recalcCompletionScore(profile.id as string);
    await syncGrantMemoryFromProfile(profile.id as string, orgId).catch(() => {});
    generateAndStoreProfileEmbedding(profile.id as string).catch(() => {});
    await requestEligibilityRefresh(orgId, "profile.company_dna.applied");
    await requestProfileEligibilityBackfill(orgId, profile.id as string, "profile.company_dna.applied");

    return NextResponse.json({ ok: true, applied: Object.keys(updates) });
  } catch (e) {
    console.error("[PROFILE_COMPANY_DNA_APPLY]", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
