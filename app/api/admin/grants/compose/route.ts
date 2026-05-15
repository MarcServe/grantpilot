import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin-auth";
import { cleanJsonResponse, completeJson } from "@/lib/openai-client";
import { normalizeGrantApplicationUrl } from "@/lib/grant-url";
import { checkUrlHealth } from "@/lib/url-health-check";
import { requestEligibilityRefresh } from "@/lib/eligibility-refresh-trigger";
import { upsertGrant, type GrantInput } from "@/lib/grants-ingest";

const draftSchema = z.object({
  externalId: z.string().max(180).optional().nullable(),
  name: z.string().min(3).max(300),
  funder: z.string().min(2).max(200),
  amount: z.preprocess(
    (value) => {
      if (value === "" || value == null) return null;
      if (typeof value === "string") {
        const parsed = Number(value.replace(/[^0-9.-]/g, ""));
        return Number.isFinite(parsed) ? parsed : null;
      }
      return value;
    },
    z.number().nullable().optional()
  ),
  deadline: z.string().nullable().optional(),
  applicationUrl: z.string().url(),
  eligibility: z.string().min(10).max(6000),
  description: z.string().max(6000).optional().nullable(),
  objectives: z.string().max(6000).optional().nullable(),
  sectors: z.array(z.string().min(1).max(80)).max(12).optional(),
  regions: z.array(z.string().min(1).max(80)).max(12).optional(),
  funderLocations: z.array(z.string().min(1).max(80)).max(8).optional(),
  applicantTypes: z.array(z.string().min(1).max(80)).max(12).optional(),
});

const requestSchema = z.object({
  rawText: z.string().max(30_000).optional(),
  sourceUrl: z.string().max(2000).optional(),
  notes: z.string().max(4000).optional(),
  publish: z.boolean().optional(),
  draft: draftSchema.optional(),
});

function coerceDraft(value: unknown): z.infer<typeof draftSchema> {
  const parsed = draftSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("OpenAI did not return a usable grant draft");
  }
  const normalizedUrl = normalizeGrantApplicationUrl(parsed.data.applicationUrl);
  if (!normalizedUrl) throw new Error("Draft application URL is invalid");
  return { ...parsed.data, applicationUrl: normalizedUrl };
}

function buildComposerPrompt(input: { rawText?: string; sourceUrl?: string; notes?: string }): string {
  return `Convert this grant source material into one structured grant record for GrantsCopilot.

Rules:
- Use only facts present in the source material, source URL, or admin notes.
- Do not invent deadlines, award amounts, eligibility rules, or URLs.
- applicationUrl must be the most direct official grant detail or application URL available.
- If the application requires login, keep the official grant/application page URL and mention sign-in in eligibility.
- If no deadline is stated, use null.
- amount must be a number in GBP/USD/EUR equivalent only when clearly stated, otherwise null.
- Use concise, practical eligibility text.

Return JSON only in this exact object shape:
{
  "grant": {
    "externalId": "optional stable source id or null",
    "name": "Grant name",
    "funder": "Funder",
    "amount": 0,
    "deadline": "YYYY-MM-DD or null",
    "applicationUrl": "https://...",
    "eligibility": "Eligibility summary",
    "description": "Short programme description",
    "objectives": "What the funder wants to achieve",
    "sectors": ["Technology"],
    "regions": ["UK"],
    "funderLocations": ["UK"],
    "applicantTypes": ["SME"]
  }
}

Source URL:
${input.sourceUrl?.trim() || "Not provided"}

Admin notes:
${input.notes?.trim() || "None"}

Source material:
${input.rawText?.trim() || "None"}`;
}

async function generateDraft(input: { rawText?: string; sourceUrl?: string; notes?: string }) {
  if (!input.rawText?.trim() && !input.sourceUrl?.trim() && !input.notes?.trim()) {
    throw new Error("Paste grant text, a URL, or admin notes before generating a draft");
  }

  const raw = await completeJson(buildComposerPrompt(input), 2200);
  const json = JSON.parse(cleanJsonResponse(raw)) as { grant?: unknown };
  return coerceDraft(json.grant ?? json);
}

async function publishDraft(draft: z.infer<typeof draftSchema>) {
  const health = await checkUrlHealth(draft.applicationUrl);
  if (health.status === "dead" || health.status === "expired") {
    throw new Error(`URL verification failed: ${health.reason}`);
  }

  const grant: GrantInput = {
    externalId: draft.externalId?.trim() || undefined,
    name: draft.name,
    funder: draft.funder,
    amount: draft.amount ?? null,
    deadline: draft.deadline ?? null,
    applicationUrl: draft.applicationUrl,
    eligibility: draft.eligibility,
    description: draft.description ?? null,
    objectives: draft.objectives ?? null,
    sectors: draft.sectors?.length ? draft.sectors : ["Other"],
    regions: draft.regions?.length ? draft.regions : ["UK"],
    funderLocations: draft.funderLocations?.length ? draft.funderLocations : undefined,
    applicantTypes: draft.applicantTypes?.length ? draft.applicantTypes : undefined,
    source: "admin",
  };

  const result = await upsertGrant(grant);
  await requestEligibilityRefresh(undefined, "admin.grants.compose.publish");
  return { ...result, health };
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    if (parsed.data.publish) {
      if (!parsed.data.draft) {
        return NextResponse.json({ error: "Draft is required before publishing" }, { status: 400 });
      }
      const draft = coerceDraft(parsed.data.draft);
      const result = await publishDraft(draft);
      return NextResponse.json({ ok: true, grantId: result.id, created: result.created, health: result.health });
    }

    const draft = await generateDraft(parsed.data);
    return NextResponse.json({ ok: true, draft });
  } catch (error) {
    console.error("[admin/grants/compose]", error);
    const message = error instanceof Error ? error.message : "Grant composer failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
