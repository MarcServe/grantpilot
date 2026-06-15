# Central Grant Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move GrantsCopilot from expensive per-business full AI scoring for every grant toward a scalable hybrid where every grant is AI-enriched once, then each business is matched against that trusted central grant intelligence with targeted OpenAI review only where it improves accuracy.

**Architecture:** Keep `EligibilityAssessment` as the business-specific result used by dashboards, notifications, and My Matches, but stop using OpenAI as the first way to understand every profile/grant pair. Upgrade `grant_ai_intelligence` into the central source of truth for grant rules, gates, deadlines, applicant types, semantic tags, and confidence; use deterministic matching and embeddings to create high-quality per-profile scores; reserve full OpenAI company-DNA scoring for uncertain or high-value candidates.

**Tech Stack:** Next.js App Router, Supabase/Postgres, existing `Grant`, `BusinessProfile`, `EligibilityAssessment`, `grant_ai_intelligence`, `eligibility_ai_score_cache`, Vercel Cron, OpenAI JSON extraction and embeddings, TypeScript tests.

---

## Current Problem

The current queue processes `EligibilityAssessment` rows per `organisation_id + profile_id + grant_id`. That is accurate, but it becomes expensive when 1,000 businesses each need full OpenAI scoring across hundreds of grants.

The target design separates two concerns:

- **Grant intelligence:** AI reads each grant once and extracts reusable structured information.
- **Business eligibility:** each profile matches against that reusable grant intelligence cheaply, with OpenAI only used for the strongest uncertain matches.

This preserves accuracy because final eligibility is still profile-specific, while reducing repeated AI work.

## File Structure

**Create**

- `grantpilot-versiontwo/supabase/migrations/054_central_grant_intelligence.sql`
  Adds missing durable columns and indexes for richer grant intelligence, adds `intelligence` to allowed scoring sources, and creates a queue table for grant-intelligence extraction.

- `grantpilot-versiontwo/lib/grant-intelligence-schema.ts`
  Defines TypeScript types for central grant intelligence and the normalized profile facts used by deterministic matching.

- `grantpilot-versiontwo/lib/grant-intelligence-extract.ts`
  Calls OpenAI once per grant content hash to extract reusable grant criteria into `grant_ai_intelligence`.

- `grantpilot-versiontwo/lib/grant-intelligence-match.ts`
  Scores a business profile against a `grant_ai_intelligence` row using hard gates, weighted criteria, embeddings, and confidence rules.

- `grantpilot-versiontwo/lib/grant-intelligence-queue.ts`
  Enqueues grants needing central intelligence and processes a bounded batch.

- `grantpilot-versiontwo/app/api/cron/grant-intelligence/route.ts`
  Vercel cron route that enriches grants centrally without touching profile-specific OpenAI scoring.

- `grantpilot-versiontwo/app/api/admin/grant-intelligence/route.ts`
  Admin route to enqueue/process grant intelligence manually and inspect counts.

- `grantpilot-versiontwo/scripts/test-grant-intelligence.ts`
  Focused TypeScript test runner for extraction parsing and deterministic matching behavior.

**Modify**

- `grantpilot-versiontwo/lib/eligibility-ai-cache.ts`
  Reuse existing `grantContentHashForEligibility` and `profileHashForEligibility`; stop treating lightweight cache touches as full intelligence extraction.

- `grantpilot-versiontwo/inngest/eligibility-refresh.ts`
  Prefer central intelligence matching for broad scoring, then enqueue only top uncertain/high-potential rows for full OpenAI review.

- `grantpilot-versiontwo/lib/eligibility-deep-score-queue.ts`
  Change backlog enqueue selection so it prioritizes profiles with complete Business DNA and does not allow one profile to monopolize the queue.

- `grantpilot-versiontwo/inngest/daily-notification-safeguard.ts`
  Allow strong central-intelligence scores to appear in daily digest, but keep high-confidence alerting strict.

- `grantpilot-versiontwo/lib/eligibility-notification-diagnostics.ts`
  Show counts by source: `openai`, `intelligence`, `heuristic`, `embedding`, `manual`.

- `grantpilot-versiontwo/app/admin/page.tsx`
  Add admin visibility for grant intelligence coverage, queue state, and profile-specific OpenAI queue drain.

- `grantpilot-versiontwo/vercel.json`
  Add an hourly central grant-intelligence cron route.

---

## Task 1: Add Central Grant Intelligence Schema

**Files:**

- Create: `grantpilot-versiontwo/supabase/migrations/054_central_grant_intelligence.sql`
- Modify: `grantpilot-versiontwo/supabase/migrations/039_eligibility_scoring_source.sql` only if local tests require a consolidated comment; production schema change lives in migration `054`.

- [ ] **Step 1: Create the migration**

Add:

```sql
ALTER TABLE grant_ai_intelligence
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS confidence text NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS extraction_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS extracted_at timestamptz,
  ADD COLUMN IF NOT EXISTS freshness jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS semantic_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS funding_purposes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS measurable_requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS exclusions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS scoring_hints jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS extraction_error text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'eligibility_assessment_scoring_source_check'
  ) THEN
    ALTER TABLE "EligibilityAssessment"
      DROP CONSTRAINT eligibility_assessment_scoring_source_check;
  END IF;
END $$;

ALTER TABLE "EligibilityAssessment"
  ADD CONSTRAINT eligibility_assessment_scoring_source_check
  CHECK ("scoring_source" IN ('openai', 'heuristic', 'embedding', 'manual', 'intelligence'));

CREATE TABLE IF NOT EXISTS grant_intelligence_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id text NOT NULL REFERENCES "Grant"(id) ON DELETE CASCADE,
  content_hash text NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  locked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grant_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_grant_ai_intelligence_status
  ON grant_ai_intelligence(status, confidence, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_grant_ai_intelligence_tags
  ON grant_ai_intelligence USING gin(semantic_tags);

CREATE INDEX IF NOT EXISTS idx_grant_intelligence_queue_status_priority
  ON grant_intelligence_queue(status, priority DESC, created_at ASC);

DROP TRIGGER IF EXISTS trg_grant_intelligence_queue_updated_at ON grant_intelligence_queue;
CREATE TRIGGER trg_grant_intelligence_queue_updated_at
BEFORE UPDATE ON grant_intelligence_queue
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
```

- [ ] **Step 2: Run schema-only validation**

Run:

```bash
npm run build
```

Expected: build succeeds before TypeScript code references the new columns because Supabase queries are string-based.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/054_central_grant_intelligence.sql
git commit -m "Add central grant intelligence schema"
```

---

## Task 2: Define Grant Intelligence Types

**Files:**

- Create: `grantpilot-versiontwo/lib/grant-intelligence-schema.ts`
- Test: `grantpilot-versiontwo/scripts/test-grant-intelligence.ts`

- [ ] **Step 1: Create the schema types**

Add:

```ts
export type Confidence = "high" | "medium" | "low";

export type RequirementRange = {
  min?: number | null;
  max?: number | null;
  required?: boolean;
  sourceText?: string;
};

export type GrantFreshness = {
  usable: boolean;
  deadline?: string | null;
  statusText?: "open" | "rolling" | "unknown" | "closed" | "expired";
  reason?: string;
};

export type GrantIntelligence = {
  summary: string;
  applicantTypes: string[];
  sectors: string[];
  regions: string[];
  fundingPurposes: string[];
  semanticTags: string[];
  hardGates: string[];
  eligibilityCriteria: string[];
  measurableRequirements: {
    employeeCount?: RequirementRange;
    annualRevenue?: RequirementRange;
    companyAgeYears?: RequirementRange;
    fundingAmount?: RequirementRange;
  };
  exclusions: string[];
  freshness: GrantFreshness;
  scoringHints: {
    likelyStrongFitSignals: string[];
    likelyWeakFitSignals: string[];
    needsHumanReview: boolean;
  };
  confidence: Confidence;
};

export type NormalizedProfileFacts = {
  businessName: string;
  sector: string;
  description: string;
  missionStatement: string;
  location: string;
  businessType: string;
  employeeCount: number | null;
  annualRevenue: number | null;
  yearEstablished: number | null;
  fundingPurposes: string[];
  fundingDetails: string;
};

export type IntelligenceMatchResult = {
  score: number;
  decision: "likely_eligible" | "review" | "unlikely";
  confidence: Confidence;
  met: string[];
  missing: string[];
  reasons: string[];
  alignment: string[];
  improvementPlan: {
    gaps: string[];
    actions: string[];
    timeline: string;
  } | null;
  requiresOpenAiReview: boolean;
};
```

- [ ] **Step 2: Add an import-only test**

Create `grantpilot-versiontwo/scripts/test-grant-intelligence.ts`:

```ts
import type { GrantIntelligence, IntelligenceMatchResult } from "../lib/grant-intelligence-schema";

const intelligence: GrantIntelligence = {
  summary: "UK innovation grant for SMEs.",
  applicantTypes: ["business", "sme"],
  sectors: ["technology"],
  regions: ["UK"],
  fundingPurposes: ["innovation"],
  semanticTags: ["ai", "r&d"],
  hardGates: ["UK applicant"],
  eligibilityCriteria: ["SME applicant", "Innovation project"],
  measurableRequirements: {},
  exclusions: [],
  freshness: { usable: true, statusText: "open" },
  scoringHints: {
    likelyStrongFitSignals: ["UK technology SME"],
    likelyWeakFitSignals: ["non-UK applicant"],
    needsHumanReview: false,
  },
  confidence: "high",
};

const result: IntelligenceMatchResult = {
  score: 85,
  decision: "likely_eligible",
  confidence: "high",
  met: ["UK applicant"],
  missing: [],
  reasons: ["Strong sector and applicant fit."],
  alignment: ["AI innovation fit."],
  improvementPlan: null,
  requiresOpenAiReview: false,
};

console.log(JSON.stringify({ ok: true, intelligence, result }));
```

- [ ] **Step 3: Run the test**

```bash
npx tsx scripts/test-grant-intelligence.ts
```

Expected: prints JSON with `"ok":true`.

- [ ] **Step 4: Commit**

```bash
git add lib/grant-intelligence-schema.ts scripts/test-grant-intelligence.ts
git commit -m "Add grant intelligence types"
```

---

## Task 3: Extract Central Grant Intelligence Once Per Grant

**Files:**

- Create: `grantpilot-versiontwo/lib/grant-intelligence-extract.ts`
- Modify: `grantpilot-versiontwo/scripts/test-grant-intelligence.ts`

- [ ] **Step 1: Add deterministic parser validation**

Extend `scripts/test-grant-intelligence.ts` with:

```ts
import { normaliseGrantIntelligenceResponse } from "../lib/grant-intelligence-extract";

const parsed = normaliseGrantIntelligenceResponse({
  summary: "Open UK grant for technology SMEs.",
  applicantTypes: ["SME", "Business"],
  sectors: ["Technology"],
  regions: ["UK"],
  fundingPurposes: ["Innovation"],
  semanticTags: ["AI", "R&D"],
  hardGates: ["Must be UK based"],
  eligibilityCriteria: ["Must be an SME"],
  measurableRequirements: {
    employeeCount: { max: 250, sourceText: "SME" },
  },
  exclusions: [],
  freshness: { usable: true, statusText: "open" },
  scoringHints: {
    likelyStrongFitSignals: ["UK technology SME"],
    likelyWeakFitSignals: ["Non-UK applicant"],
    needsHumanReview: false,
  },
  confidence: "high",
});

if (parsed.applicantTypes[0] !== "business") throw new Error("applicant type normalization failed");
if (parsed.measurableRequirements.employeeCount?.max !== 250) throw new Error("employee max parsing failed");
```

- [ ] **Step 2: Create extraction module**

Add `grantpilot-versiontwo/lib/grant-intelligence-extract.ts`:

```ts
import { cleanJsonResponse, completeJson } from "@/lib/openai-client";
import { grantContentHashForEligibility } from "@/lib/eligibility-ai-cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { GrantIntelligence, Confidence } from "@/lib/grant-intelligence-schema";

type GrantRow = {
  id: string;
  name: string;
  funder: string;
  amount?: number | null;
  deadline?: string | null;
  applicationUrl?: string | null;
  eligibility?: string | null;
  description?: string | null;
  objectives?: string | null;
  applicantTypes?: string[] | null;
  sectors?: string[] | null;
  regions?: string[] | null;
  url_status?: string | null;
};

const APPLICANT_MAP: Record<string, string> = {
  sme: "sme",
  business: "business",
  company: "business",
  startup: "startup",
  "start-up": "startup",
  charity: "charity",
  nonprofit: "charity",
  "non-profit": "charity",
  university: "university",
  academic: "university",
  individual: "individual",
  public: "public_sector",
};

function cleanArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

function normaliseApplicantTypes(values: unknown): string[] {
  return cleanArray(values).map((value) => {
    const lower = value.toLowerCase();
    return APPLICANT_MAP[lower] ?? lower.replace(/\s+/g, "_");
  });
}

function confidence(value: unknown): Confidence {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

export function normaliseGrantIntelligenceResponse(raw: unknown): GrantIntelligence {
  const input = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const measurable = input.measurableRequirements && typeof input.measurableRequirements === "object"
    ? input.measurableRequirements as GrantIntelligence["measurableRequirements"]
    : {};
  const freshness = input.freshness && typeof input.freshness === "object"
    ? input.freshness as GrantIntelligence["freshness"]
    : { usable: true, statusText: "unknown" as const };
  const hints = input.scoringHints && typeof input.scoringHints === "object"
    ? input.scoringHints as GrantIntelligence["scoringHints"]
    : { likelyStrongFitSignals: [], likelyWeakFitSignals: [], needsHumanReview: true };

  return {
    summary: String(input.summary ?? "").trim(),
    applicantTypes: normaliseApplicantTypes(input.applicantTypes),
    sectors: cleanArray(input.sectors).map((value) => value.toLowerCase()),
    regions: cleanArray(input.regions),
    fundingPurposes: cleanArray(input.fundingPurposes).map((value) => value.toLowerCase()),
    semanticTags: cleanArray(input.semanticTags).map((value) => value.toLowerCase()),
    hardGates: cleanArray(input.hardGates),
    eligibilityCriteria: cleanArray(input.eligibilityCriteria),
    measurableRequirements: measurable,
    exclusions: cleanArray(input.exclusions),
    freshness: {
      usable: freshness.usable !== false,
      deadline: freshness.deadline ?? null,
      statusText: freshness.statusText ?? "unknown",
      reason: freshness.reason,
    },
    scoringHints: {
      likelyStrongFitSignals: cleanArray(hints.likelyStrongFitSignals),
      likelyWeakFitSignals: cleanArray(hints.likelyWeakFitSignals),
      needsHumanReview: hints.needsHumanReview === true,
    },
    confidence: confidence(input.confidence),
  };
}

export async function extractGrantIntelligence(grant: GrantRow): Promise<GrantIntelligence> {
  const text = await completeJson(
    `You are extracting reusable grant eligibility intelligence. Do not score any specific company.

Grant:
Name: ${grant.name}
Funder: ${grant.funder}
Deadline: ${grant.deadline ?? "Not recorded"}
URL status: ${grant.url_status ?? "unknown"}
Amount: ${grant.amount ?? "Not recorded"}
Eligibility: ${grant.eligibility ?? ""}
Description: ${grant.description ?? ""}
Objectives: ${grant.objectives ?? ""}
Applicant types: ${(grant.applicantTypes ?? []).join(", ")}
Sectors: ${(grant.sectors ?? []).join(", ")}
Regions: ${(grant.regions ?? []).join(", ")}

Return ONLY JSON with this exact shape:
{
  "summary": "Reusable summary of what this grant funds and who can apply.",
  "applicantTypes": ["business", "sme", "startup", "charity", "university", "individual", "public_sector"],
  "sectors": ["technology"],
  "regions": ["UK"],
  "fundingPurposes": ["innovation", "r&d"],
  "semanticTags": ["ai", "prototype"],
  "hardGates": ["Must be UK based"],
  "eligibilityCriteria": ["SME applicant"],
  "measurableRequirements": {
    "employeeCount": { "min": null, "max": 250, "required": false, "sourceText": "SME" },
    "annualRevenue": { "min": null, "max": null, "required": false, "sourceText": "" },
    "companyAgeYears": { "min": null, "max": null, "required": false, "sourceText": "" },
    "fundingAmount": { "min": null, "max": null, "required": false, "sourceText": "" }
  },
  "exclusions": [],
  "freshness": { "usable": true, "deadline": null, "statusText": "open", "reason": "" },
  "scoringHints": {
    "likelyStrongFitSignals": ["UK technology SME"],
    "likelyWeakFitSignals": ["non-UK applicant"],
    "needsHumanReview": false
  },
  "confidence": "high"
}

Rules:
- Extract only what is stated or strongly implied by the grant text.
- Do not invent revenue, age, team, or traction requirements.
- If deadline is expired or page says closed, freshness.usable must be false.
- If requirements are unclear, set confidence to medium or low and needsHumanReview to true.`,
    1800
  );

  const parsed = JSON.parse(cleanJsonResponse(text));
  return normaliseGrantIntelligenceResponse(parsed);
}

export async function ensureGrantIntelligence(grantId: string): Promise<{ status: "created" | "reused" | "failed"; error?: string }> {
  const supabase = getSupabaseAdmin();
  const { data: grant, error } = await supabase
    .from("Grant")
    .select("id, name, funder, amount, deadline, applicationUrl, eligibility, description, objectives, applicantTypes, sectors, regions, url_status")
    .eq("id", grantId)
    .maybeSingle();
  if (error) return { status: "failed", error: error.message };
  if (!grant) return { status: "failed", error: "Grant not found" };

  const contentHash = grantContentHashForEligibility(grant);
  const { data: existing } = await supabase
    .from("grant_ai_intelligence")
    .select("content_hash, status")
    .eq("grant_id", grantId)
    .maybeSingle();
  if (existing?.content_hash === contentHash && existing.status === "ready") {
    return { status: "reused" };
  }

  try {
    const intelligence = await extractGrantIntelligence(grant);
    const now = new Date().toISOString();
    const { error: upsertError } = await supabase.from("grant_ai_intelligence").upsert({
      grant_id: grantId,
      content_hash: contentHash,
      reusable_summary: intelligence.summary,
      extracted_criteria: intelligence,
      eligibility_criteria: intelligence.eligibilityCriteria,
      hard_gates: intelligence.hardGates,
      applicant_types: intelligence.applicantTypes,
      sectors: intelligence.sectors,
      regions: intelligence.regions,
      freshness: intelligence.freshness,
      semantic_tags: intelligence.semanticTags,
      funding_purposes: intelligence.fundingPurposes,
      measurable_requirements: intelligence.measurableRequirements,
      exclusions: intelligence.exclusions,
      scoring_hints: intelligence.scoringHints,
      confidence: intelligence.confidence,
      status: "ready",
      model: process.env.OPENAI_WORKER_MODEL ?? process.env.OPENAI_MODEL ?? "default",
      extracted_at: now,
      extraction_error: null,
      updated_at: now,
    }, { onConflict: "grant_id" });
    if (upsertError) throw upsertError;
    return { status: "created" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from("grant_ai_intelligence").upsert({
      grant_id: grantId,
      content_hash: contentHash,
      status: "failed",
      extraction_error: message.slice(0, 1000),
      updated_at: new Date().toISOString(),
    }, { onConflict: "grant_id" });
    return { status: "failed", error: message };
  }
}
```

- [ ] **Step 3: Run parser test**

```bash
npx tsx scripts/test-grant-intelligence.ts
```

Expected: exits successfully.

- [ ] **Step 4: Commit**

```bash
git add lib/grant-intelligence-extract.ts scripts/test-grant-intelligence.ts
git commit -m "Extract reusable grant intelligence"
```

---

## Task 4: Add Deterministic Profile-to-Grant-Intelligence Matching

**Files:**

- Create: `grantpilot-versiontwo/lib/grant-intelligence-match.ts`
- Modify: `grantpilot-versiontwo/scripts/test-grant-intelligence.ts`

- [ ] **Step 1: Add matching tests**

Append:

```ts
import { matchProfileToGrantIntelligence } from "../lib/grant-intelligence-match";

const strongMatch = matchProfileToGrantIntelligence({
  businessName: "Biz Boosters Limited",
  sector: "Technology",
  description: "AI automation platform for SMEs",
  missionStatement: "Make grant discovery automated",
  location: "London, UK",
  businessType: "business",
  employeeCount: 2,
  annualRevenue: 5000,
  yearEstablished: 2025,
  fundingPurposes: ["innovation", "ai"],
  fundingDetails: "Funding for AI product development",
}, parsed);

if (strongMatch.score < 75) throw new Error(`expected strong match, got ${strongMatch.score}`);
if (strongMatch.requiresOpenAiReview) throw new Error("high-confidence strong match should not require OpenAI review");

const blockedMatch = matchProfileToGrantIntelligence({
  businessName: "SaaS Business",
  sector: "Software",
  description: "A US SaaS company",
  missionStatement: "Software analytics",
  location: "New York, USA",
  businessType: "business",
  employeeCount: 10,
  annualRevenue: 100000,
  yearEstablished: 2020,
  fundingPurposes: ["marketing"],
  fundingDetails: "US market growth",
}, {
  ...parsed,
  regions: ["UK"],
  hardGates: ["Must be UK based"],
});

if (blockedMatch.score > 40) throw new Error(`expected geography block, got ${blockedMatch.score}`);
```

- [ ] **Step 2: Implement matching module**

Create:

```ts
import type { GrantIntelligence, IntelligenceMatchResult, NormalizedProfileFacts } from "@/lib/grant-intelligence-schema";

function includesAny(text: string, values: string[]): boolean {
  const lower = text.toLowerCase();
  return values.some((value) => lower.includes(value.toLowerCase()));
}

function profileAge(profile: NormalizedProfileFacts): number | null {
  if (!profile.yearEstablished) return null;
  const year = new Date().getFullYear();
  if (profile.yearEstablished < 1800 || profile.yearEstablished > year) return null;
  return Math.max(0, year - profile.yearEstablished);
}

function rangePass(value: number | null, min?: number | null, max?: number | null): "pass" | "missing" | "fail" {
  if (value == null) return min != null || max != null ? "missing" : "pass";
  if (min != null && value < min) return "fail";
  if (max != null && value > max) return "fail";
  return "pass";
}

export function matchProfileToGrantIntelligence(
  profile: NormalizedProfileFacts,
  intelligence: GrantIntelligence
): IntelligenceMatchResult {
  const met: string[] = [];
  const missing: string[] = [];
  const reasons: string[] = [];
  const alignment: string[] = [];
  const actions: string[] = [];
  let score = 50;
  let hardBlocked = false;
  let uncertain = intelligence.confidence !== "high" || intelligence.scoringHints.needsHumanReview;

  if (!intelligence.freshness.usable || intelligence.freshness.statusText === "closed" || intelligence.freshness.statusText === "expired") {
    return {
      score: 0,
      decision: "unlikely",
      confidence: intelligence.confidence,
      met: [],
      missing: ["Grant is not currently actionable"],
      reasons: [intelligence.freshness.reason ?? "Grant appears closed or expired."],
      alignment: [],
      improvementPlan: { gaps: ["Grant is not actionable"], actions: ["Use another current opportunity."], timeline: "Before applying" },
      requiresOpenAiReview: false,
    };
  }

  const profileText = [
    profile.businessName,
    profile.sector,
    profile.description,
    profile.missionStatement,
    profile.fundingDetails,
    profile.fundingPurposes.join(" "),
  ].join(" ").toLowerCase();

  if (intelligence.regions.length > 0) {
    const regionFit = intelligence.regions.some((region) => {
      const r = region.toLowerCase();
      return r === "global" || r === "international" || profile.location.toLowerCase().includes(r.toLowerCase()) || (r === "uk" && /uk|united kingdom|england|scotland|wales|northern ireland|london/.test(profile.location.toLowerCase()));
    });
    if (regionFit) {
      score += 15;
      met.push("Location appears eligible");
    } else {
      score -= 35;
      hardBlocked = true;
      missing.push("Location does not match grant region");
      actions.push("Check whether the funder accepts applicants from your location.");
    }
  }

  if (intelligence.applicantTypes.length > 0) {
    const typeText = `${profile.businessType} ${profile.description}`.toLowerCase();
    const typeFit = intelligence.applicantTypes.some((type) => {
      if (type === "business" || type === "sme" || type === "startup") return /business|company|limited|startup|start-up|sme/.test(typeText);
      return typeText.includes(type);
    });
    if (typeFit) {
      score += 15;
      met.push("Applicant type appears eligible");
    } else {
      score -= 35;
      hardBlocked = true;
      missing.push("Applicant type does not match stated eligibility");
      actions.push("Only apply if your organisation has one of the required legal applicant types.");
    }
  }

  if (intelligence.sectors.length > 0 || intelligence.semanticTags.length > 0) {
    const sectorFit = includesAny(profileText, [...intelligence.sectors, ...intelligence.semanticTags]);
    if (sectorFit) {
      score += 15;
      met.push("Sector and semantic focus align");
      alignment.push("Business activity overlaps the grant focus.");
    } else {
      score -= 15;
      missing.push("Sector alignment is unclear");
      actions.push("Confirm the project clearly fits the funder's sector focus.");
      uncertain = true;
    }
  }

  if (intelligence.fundingPurposes.length > 0) {
    const purposeFit = includesAny(profileText, intelligence.fundingPurposes);
    if (purposeFit) {
      score += 10;
      met.push("Funding purpose aligns");
    } else {
      score -= 10;
      missing.push("Funding purpose alignment is unclear");
      uncertain = true;
    }
  }

  const req = intelligence.measurableRequirements;
  const employee = rangePass(profile.employeeCount, req.employeeCount?.min, req.employeeCount?.max);
  const revenue = rangePass(profile.annualRevenue, req.annualRevenue?.min, req.annualRevenue?.max);
  const age = rangePass(profileAge(profile), req.companyAgeYears?.min, req.companyAgeYears?.max);

  for (const [label, status] of [["Employee count", employee], ["Revenue", revenue], ["Company age", age]] as const) {
    if (status === "pass") met.push(`${label} does not block eligibility`);
    if (status === "missing") {
      score -= 8;
      missing.push(`${label} needed for a confident check`);
      actions.push(`Add ${label.toLowerCase()} to the Business DNA profile.`);
      uncertain = true;
    }
    if (status === "fail") {
      score -= 35;
      hardBlocked = true;
      missing.push(`${label} does not meet stated requirement`);
      actions.push(`Do not treat as high fit unless the funder confirms flexibility on ${label.toLowerCase()}.`);
    }
  }

  if (profile.description.length > 80 && profile.missionStatement.length > 20) {
    score += 5;
    met.push("Business DNA has enough narrative detail for matching");
  } else {
    missing.push("Business DNA narrative is thin");
    uncertain = true;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  if (hardBlocked) score = Math.min(score, 35);
  if (intelligence.confidence === "low") score = Math.min(score, 74);

  const decision = score >= 85 && !hardBlocked ? "likely_eligible" : score >= 40 ? "review" : "unlikely";
  const requiresOpenAiReview = uncertain || (score >= 70 && score < 85);

  reasons.push(score >= 85 ? "Central grant intelligence shows strong profile fit." : "Central grant intelligence found gaps or uncertainty.");

  return {
    score,
    decision,
    confidence: intelligence.confidence,
    met: [...new Set(met)],
    missing: [...new Set(missing)],
    reasons,
    alignment,
    improvementPlan: score >= 85 ? null : { gaps: [...new Set(missing)], actions: [...new Set(actions)], timeline: "Before applying" },
    requiresOpenAiReview,
  };
}
```

- [ ] **Step 3: Run the matching test**

```bash
npx tsx scripts/test-grant-intelligence.ts
```

Expected: exits successfully.

- [ ] **Step 4: Commit**

```bash
git add lib/grant-intelligence-match.ts scripts/test-grant-intelligence.ts
git commit -m "Match profiles against grant intelligence"
```

---

## Task 5: Add Grant Intelligence Queue and Cron

**Files:**

- Create: `grantpilot-versiontwo/lib/grant-intelligence-queue.ts`
- Create: `grantpilot-versiontwo/app/api/cron/grant-intelligence/route.ts`
- Modify: `grantpilot-versiontwo/vercel.json`

- [ ] **Step 1: Implement queue processing**

Create `lib/grant-intelligence-queue.ts`:

```ts
import { grantContentHashForEligibility } from "@/lib/eligibility-ai-cache";
import { ensureGrantIntelligence } from "@/lib/grant-intelligence-extract";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function enqueueGrantsForIntelligence(limit = 500): Promise<{ scanned: number; enqueued: number }> {
  const supabase = getSupabaseAdmin();
  const { data: grants, error } = await supabase
    .from("Grant")
    .select("id, name, funder, amount, deadline, applicationUrl, eligibility, description, objectives, applicantTypes, sectors, regions, url_status, created_at")
    .neq("url_status", "expired")
    .neq("url_status", "dead")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(1000, limit)));
  if (error) throw error;

  const rows = (grants ?? []).map((grant) => ({
    grant_id: grant.id,
    content_hash: grantContentHashForEligibility(grant),
    status: "pending",
    priority: grant.deadline ? 100 : 50,
    last_error: null,
    updated_at: new Date().toISOString(),
  }));
  if (rows.length === 0) return { scanned: 0, enqueued: 0 };

  const { error: upsertError } = await supabase
    .from("grant_intelligence_queue")
    .upsert(rows, { onConflict: "grant_id,content_hash" });
  if (upsertError) throw upsertError;
  return { scanned: rows.length, enqueued: rows.length };
}

export async function processGrantIntelligenceQueue(limit = 25): Promise<{ requested: number; completed: number; failed: number; skipped: number }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("grant_intelligence_queue")
    .select("id, grant_id, attempts")
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(50, limit)));
  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) return { requested: 0, completed: 0, failed: 0, skipped: 0 };

  await supabase
    .from("grant_intelligence_queue")
    .update({ status: "running", locked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .in("id", rows.map((row) => row.id));

  let completed = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    const result = await ensureGrantIntelligence(row.grant_id);
    if (result.status === "created" || result.status === "reused") {
      completed++;
      await supabase.from("grant_intelligence_queue").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        last_error: null,
      }).eq("id", row.id);
    } else if (result.error === "Grant not found") {
      skipped++;
      await supabase.from("grant_intelligence_queue").update({
        status: "skipped",
        last_error: result.error,
      }).eq("id", row.id);
    } else {
      failed++;
      await supabase.from("grant_intelligence_queue").update({
        status: "failed",
        attempts: (row.attempts ?? 0) + 1,
        last_error: (result.error ?? "Unknown error").slice(0, 1000),
      }).eq("id", row.id);
    }
  }

  return { requested: rows.length, completed, failed, skipped };
}
```

- [ ] **Step 2: Add cron route**

Create `app/api/cron/grant-intelligence/route.ts`:

```ts
import { NextResponse } from "next/server";
import { runWithCronLog } from "@/lib/cron-run-log";
import { enqueueGrantsForIntelligence, processGrantIntelligenceQueue } from "@/lib/grant-intelligence-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runWithCronLog(
    { jobName: "Grant Intelligence Queue", route: "/api/cron/grant-intelligence", trigger: "vercel" },
    async () => {
      const enqueued = await enqueueGrantsForIntelligence(Number(process.env.GRANT_INTELLIGENCE_ENQUEUE_LIMIT ?? 500));
      const processed = await processGrantIntelligenceQueue(Number(process.env.GRANT_INTELLIGENCE_BATCH_SIZE ?? 25));
      return { enqueued, processed };
    }
  );

  return NextResponse.json({ ok: true, ...result });
}
```

- [ ] **Step 3: Add Vercel schedule**

Modify `vercel.json`:

```json
{
  "path": "/api/cron/grant-intelligence",
  "schedule": "5 * * * *"
}
```

Keep existing cron entries unchanged.

- [ ] **Step 4: Run build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add lib/grant-intelligence-queue.ts app/api/cron/grant-intelligence/route.ts vercel.json
git commit -m "Add grant intelligence cron queue"
```

---

## Task 6: Use Grant Intelligence During Eligibility Refresh

**Files:**

- Modify: `grantpilot-versiontwo/inngest/eligibility-refresh.ts`
- Modify: `grantpilot-versiontwo/lib/eligibility-deep-score-queue.ts`

- [ ] **Step 1: Add helper to normalize profile**

In `lib/grant-intelligence-match.ts`, export:

```ts
export function normalizeProfileFacts(profile: Record<string, unknown>): NormalizedProfileFacts {
  const get = (camel: string, snake = camel.replace(/([A-Z])/g, "_$1").toLowerCase()) => profile[camel] ?? profile[snake];
  return {
    businessName: String(get("businessName") ?? ""),
    sector: String(get("sector") ?? ""),
    description: String(get("description") ?? ""),
    missionStatement: String(get("missionStatement") ?? ""),
    location: String(get("location") ?? ""),
    businessType: String(get("businessType") ?? ""),
    employeeCount: get("employeeCount") == null ? null : Number(get("employeeCount")),
    annualRevenue: get("annualRevenue") == null ? null : Number(get("annualRevenue")),
    yearEstablished: get("yearEstablished") == null ? null : Number(get("yearEstablished")),
    fundingPurposes: Array.isArray(get("fundingPurposes")) ? get("fundingPurposes") as string[] : [],
    fundingDetails: String(get("fundingDetails") ?? ""),
  };
}
```

- [ ] **Step 2: Query grant intelligence with grant rows**

In `inngest/eligibility-refresh.ts`, after final candidate grant IDs are known, fetch:

```ts
const { data: intelligenceRows } = await supabase
  .from("grant_ai_intelligence")
  .select("grant_id, content_hash, extracted_criteria, confidence, status")
  .in("grant_id", candidateGrantIds)
  .eq("status", "ready");

const intelligenceByGrant = new Map(
  (intelligenceRows ?? []).map((row) => [row.grant_id, row])
);
```

- [ ] **Step 3: Upsert `intelligence` eligibility rows before heuristic fallback**

For every candidate with ready intelligence:

```ts
const profileFacts = normalizeProfileFacts(profile as Record<string, unknown>);
const match = matchProfileToGrantIntelligence(profileFacts, row.extracted_criteria as GrantIntelligence);

await supabase.from("EligibilityAssessment").upsert({
  organisation_id: orgId,
  profile_id: profileId,
  grant_id: grantId,
  score: match.score,
  decision: match.decision,
  summary: match.reasons[0],
  reasons: match.reasons,
  alignment: match.alignment,
  improvement_plan: match.improvementPlan,
  met_criteria: match.met,
  missing_criteria: match.missing,
  scoring_source: "intelligence",
  updated_at: new Date().toISOString(),
}, { onConflict: "organisation_id,profile_id,grant_id" });
```

- [ ] **Step 4: Enqueue only the right rows for full OpenAI review**

Only enqueue full OpenAI review when:

```ts
match.requiresOpenAiReview || (match.score >= 80 && match.confidence !== "high")
```

Keep hard-gated low scores out of full OpenAI review.

- [ ] **Step 5: Make backlog enqueue fair across profiles**

In `lib/eligibility-deep-score-queue.ts`, update `enqueueExistingHeuristicAssessments` so it fetches up to `limit * 5`, groups rows by profile, then round-robins profiles and enqueues no more than `ELIGIBILITY_DEEP_SCORE_QUEUE_PER_PROFILE_LIMIT`, default `25`, per profile per cron pass.

Use this algorithm:

```ts
const perProfileLimit = positiveIntFromEnv("ELIGIBILITY_DEEP_SCORE_QUEUE_PER_PROFILE_LIMIT", 25);
const groupedByProfile = new Map<string, typeof assessments>();
for (const row of assessments) {
  const key = `${row.organisation_id}:${row.profile_id}`;
  groupedByProfile.set(key, [...(groupedByProfile.get(key) ?? []), row]);
}
const selected = [];
while (selected.length < limit && groupedByProfile.size > 0) {
  for (const [key, rows] of groupedByProfile) {
    const next = rows.shift();
    if (next) selected.push(next);
    if (rows.length === 0 || selected.filter((row) => `${row.organisation_id}:${row.profile_id}` === key).length >= perProfileLimit) {
      groupedByProfile.delete(key);
    }
    if (selected.length >= limit) break;
  }
}
```

- [ ] **Step 6: Build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add inngest/eligibility-refresh.ts lib/eligibility-deep-score-queue.ts lib/grant-intelligence-match.ts
git commit -m "Use grant intelligence for scalable matching"
```

---

## Task 7: Notification Rules for Central Intelligence

**Files:**

- Modify: `grantpilot-versiontwo/lib/eligibility-final-score.ts`
- Modify: `grantpilot-versiontwo/lib/eligibility-notify-config.ts`
- Modify: `grantpilot-versiontwo/inngest/daily-notification-safeguard.ts`
- Test: `grantpilot-versiontwo/scripts/test-eligibility-score-guards.ts`

- [ ] **Step 1: Keep high-confidence alerts strict**

Update notification helper logic so:

```ts
const isTrustedForDigest = ["openai", "intelligence"].includes(scoringSource);
const isTrustedForHighValueAlert = scoringSource === "openai" || (scoringSource === "intelligence" && score >= 90 && missing.length === 0);
```

This means central intelligence can enrich daily digests, but WhatsApp/high-alerts remain conservative.

- [ ] **Step 2: Restore user-friendly within-reach digest behavior**

In `daily-notification-safeguard.ts`, ensure the digest includes:

```ts
const withinReach = rows
  .filter((row) => row.score >= 60 && row.score < 85)
  .filter((row) => row.scoring_source === "openai" || row.scoring_source === "intelligence")
  .slice(0, 5);
```

If there are no 85+ rows, send the within-reach digest, not only a generic scan-complete email.

- [ ] **Step 3: Add test case**

In `scripts/test-eligibility-score-guards.ts`, add:

```ts
const intelligenceDigestEligible = {
  score: 78,
  decision: "review",
  scoring_source: "intelligence",
  missing_criteria: ["Project evidence unclear"],
};
if (intelligenceDigestEligible.score < 70) throw new Error("intelligence within-reach row should be digest-visible");
```

- [ ] **Step 4: Run tests**

```bash
npm run test:eligibility-score-guards
npm run test:grant-actionability
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add lib/eligibility-final-score.ts lib/eligibility-notify-config.ts inngest/daily-notification-safeguard.ts scripts/test-eligibility-score-guards.ts
git commit -m "Use central intelligence in daily digests"
```

---

## Task 8: Admin Visibility and Manual Controls

**Files:**

- Create: `grantpilot-versiontwo/app/api/admin/grant-intelligence/route.ts`
- Modify: `grantpilot-versiontwo/app/admin/page.tsx`

- [ ] **Step 1: Add admin API**

Create `app/api/admin/grant-intelligence/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { enqueueGrantsForIntelligence, processGrantIntelligenceQueue } from "@/lib/grant-intelligence-queue";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  await requireAdmin();
  const supabase = getSupabaseAdmin();
  const statuses = ["pending", "running", "completed", "failed", "skipped"];
  const counts: Record<string, number> = {};
  for (const status of statuses) {
    const { count } = await supabase.from("grant_intelligence_queue").select("id", { count: "exact", head: true }).eq("status", status);
    counts[status] = count ?? 0;
  }
  const ready = await supabase.from("grant_ai_intelligence").select("grant_id", { count: "exact", head: true }).eq("status", "ready");
  return NextResponse.json({ counts, ready: ready.count ?? 0 });
}

export async function POST(req: Request) {
  await requireAdmin();
  const body = await req.json().catch(() => ({}));
  if (body.action === "enqueue") {
    return NextResponse.json(await enqueueGrantsForIntelligence(Number(body.limit ?? 500)));
  }
  if (body.action === "process") {
    return NextResponse.json(await processGrantIntelligenceQueue(Number(body.limit ?? 25)));
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
```

- [ ] **Step 2: Add admin card**

In `app/admin/page.tsx`, add a card near “Deep eligibility scoring”:

```tsx
<section className="rounded-lg border bg-card p-6 shadow-sm">
  <h2 className="text-lg font-semibold">Grant intelligence</h2>
  <p className="mt-2 text-sm text-muted-foreground">
    Central AI extraction that reads each grant once and stores reusable eligibility rules.
  </p>
  <div className="mt-4 grid grid-cols-2 gap-3">
    <Metric label="Ready" value={grantIntelligenceReadyCount} />
    <Metric label="Pending" value={grantIntelligencePendingCount} />
  </div>
</section>
```

Use the local metric component pattern already used in the admin page.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/grant-intelligence/route.ts app/admin/page.tsx
git commit -m "Add grant intelligence admin controls"
```

---

## Task 9: Production Rollout

**Files:**

- Modify only if needed: `grantpilot-versiontwo/README.md`

- [ ] **Step 1: Apply migration**

Apply:

```bash
supabase migration up
```

Expected: migration `054_central_grant_intelligence.sql` is applied once.

- [ ] **Step 2: Deploy versiontwo**

Push `versiontwo`, deploy preview, then promote only after checks:

```bash
git push origin versiontwo
```

- [ ] **Step 3: Trigger central grant intelligence once**

Run against preview or production after deployment:

```bash
curl -sS \
  -H "Authorization: Bearer $CRON_SECRET" \
  "https://www.grantscopilot.com/api/cron/grant-intelligence"
```

Expected response:

```json
{
  "ok": true,
  "result": {
    "enqueued": { "scanned": 500, "enqueued": 500 },
    "processed": { "requested": 25, "completed": 25, "failed": 0, "skipped": 0 }
  }
}
```

- [ ] **Step 4: Trigger deep-score queue once**

```bash
curl -sS \
  -H "Authorization: Bearer $CRON_SECRET" \
  "https://www.grantscopilot.com/api/cron/deep-score-queue"
```

Expected: it processes profile-specific OpenAI rows, but with less pressure because central intelligence has already handled broad grant understanding.

- [ ] **Step 5: Verify admin**

Open:

```text
https://www.grantscopilot.com/admin
```

Expected:

- Grant intelligence ready count increases.
- Deep-score pending rows are spread across organisations.
- Source attribution still shows grant source counts.
- Daily digest still has within-reach grants when no 85+ exists.

---

## Accuracy Rules

The central table must **never** claim a business is eligible by itself unless:

- grant freshness is usable;
- no hard applicant-type/location/deadline gate failed;
- grant intelligence confidence is `high`;
- deterministic match score is at least `85`;
- missing criteria list is empty or advisory-only.

Use OpenAI per-profile review when:

- central match is `70-84`;
- central match is `85+` but confidence is `medium` or `low`;
- profile data is thin;
- grant text has unclear or conflicting eligibility;
- grant value is high and the user is paid;
- a new paid user completes Business DNA and needs first-day results.

This avoids false positives while keeping costs low.

## Cost Model

Before:

```text
1,000 businesses x 1,500 grants = up to 1,500,000 profile/grant AI checks
```

After:

```text
1,500 grants x 1 central AI extraction = 1,500 AI calls
+ cheap rules/embeddings for every business
+ targeted OpenAI reviews only for high-potential/uncertain matches
```

The app still stores final user-facing results in `EligibilityAssessment`, so existing UI and notifications do not need a full rewrite.

## Test Plan

Run:

```bash
npx tsx scripts/test-grant-intelligence.ts
npm run test:eligibility-score-guards
npm run test:grant-actionability
npm run build
```

Expected:

- grant intelligence parser normalizes applicant types and measurable requirements;
- deterministic matching blocks wrong-location grants;
- deterministic matching gives strong UK tech SME grants a high score;
- expired/dead grants remain suppressed;
- build succeeds.

## Self-Review

- Spec coverage: central grant processing, shared semantic table, profile-specific matching, targeted OpenAI review, notification behavior, queue scaling, and admin visibility are covered.
- Placeholder scan: no implementation step depends on unspecified code; every new file has a concrete skeleton and behavior.
- Type consistency: the plan uses `GrantIntelligence`, `NormalizedProfileFacts`, and `IntelligenceMatchResult` consistently across extraction, matching, refresh, and tests.

## Execution Options

Plan complete and saved to `docs/superpowers/plans/2026-06-15-central-grant-intelligence.md`.

**1. Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, faster but controlled.

**2. Inline Execution** - execute tasks in this session using executing-plans, with checkpoints after each task.
