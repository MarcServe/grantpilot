export type GrantIntelligenceStatus = "pending" | "ready" | "failed" | "stale";

export type GrantFreshnessIntelligence = {
  status: "current" | "stale" | "unknown";
  deadline?: string | null;
  evidence?: string[];
};

export type GrantRequirement = {
  label: string;
  value?: string | number | boolean | null;
  required?: boolean;
};

export type GrantScoringHints = {
  strongSignals: string[];
  weakSignals: string[];
  redFlags: string[];
};

export type GrantIntelligence = {
  status: GrantIntelligenceStatus;
  model?: string | null;
  confidence: number;
  reusableSummary: string;
  extractedCriteria: Record<string, unknown>;
  eligibilityCriteria: string[];
  hardGates: string[];
  applicantTypes: string[];
  sectors: string[];
  regions: string[];
  fundingPurposes: string[];
  semanticTags: string[];
  measurableRequirements: GrantRequirement[];
  exclusions: string[];
  freshness: GrantFreshnessIntelligence;
  scoringHints: GrantScoringHints;
  reusablePrompt?: string | null;
  extractionError?: string | null;
};

export type GrantIntelligenceDbRow = {
  grant_id: string;
  content_hash?: string | null;
  status?: string | null;
  model?: string | null;
  confidence?: number | null;
  reusable_summary?: string | null;
  extracted_criteria?: unknown;
  eligibility_criteria?: unknown;
  hard_gates?: unknown;
  applicant_types?: unknown;
  sectors?: unknown;
  regions?: unknown;
  funding_purposes?: unknown;
  semantic_tags?: unknown;
  measurable_requirements?: unknown;
  exclusions?: unknown;
  freshness?: unknown;
  scoring_hints?: unknown;
  reusable_prompt?: string | null;
  extraction_error?: string | null;
};

function clampScore(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const text = String(item ?? "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result.slice(0, 30);
}

function requirementArray(value: unknown): GrantRequirement[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): GrantRequirement | null => {
      if (typeof item === "string") return { label: item, required: true };
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const label = String(record.label ?? record.name ?? record.requirement ?? "").trim();
      if (!label) return null;
      return {
        label,
        value: typeof record.value === "string" || typeof record.value === "number" || typeof record.value === "boolean"
          ? record.value
          : null,
        required: record.required !== false,
      };
    })
    .filter((item): item is GrantRequirement => Boolean(item))
    .slice(0, 20);
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function freshness(value: unknown): GrantFreshnessIntelligence {
  const record = recordOrEmpty(value);
  const rawStatus = String(record.status ?? "unknown").toLowerCase();
  const status = rawStatus === "current" || rawStatus === "stale" ? rawStatus : "unknown";
  return {
    status,
    deadline: typeof record.deadline === "string" ? record.deadline : null,
    evidence: stringArray(record.evidence),
  };
}

function scoringHints(value: unknown): GrantScoringHints {
  const record = recordOrEmpty(value);
  return {
    strongSignals: stringArray(record.strongSignals ?? record.strong_signals),
    weakSignals: stringArray(record.weakSignals ?? record.weak_signals),
    redFlags: stringArray(record.redFlags ?? record.red_flags),
  };
}

export function normalizeGrantIntelligence(value: unknown): GrantIntelligence {
  const record = recordOrEmpty(value);
  const rawStatus = String(record.status ?? "ready").toLowerCase();
  const status: GrantIntelligenceStatus =
    rawStatus === "pending" || rawStatus === "failed" || rawStatus === "stale" ? rawStatus : "ready";

  return {
    status,
    model: typeof record.model === "string" ? record.model : null,
    confidence: clampScore(record.confidence, status === "ready" ? 70 : 0),
    reusableSummary: String(record.reusableSummary ?? record.reusable_summary ?? record.summary ?? "").trim(),
    extractedCriteria: recordOrEmpty(record.extractedCriteria ?? record.extracted_criteria),
    eligibilityCriteria: stringArray(record.eligibilityCriteria ?? record.eligibility_criteria),
    hardGates: stringArray(record.hardGates ?? record.hard_gates),
    applicantTypes: stringArray(record.applicantTypes ?? record.applicant_types),
    sectors: stringArray(record.sectors),
    regions: stringArray(record.regions),
    fundingPurposes: stringArray(record.fundingPurposes ?? record.funding_purposes),
    semanticTags: stringArray(record.semanticTags ?? record.semantic_tags),
    measurableRequirements: requirementArray(record.measurableRequirements ?? record.measurable_requirements),
    exclusions: stringArray(record.exclusions),
    freshness: freshness(record.freshness),
    scoringHints: scoringHints(record.scoringHints ?? record.scoring_hints),
    reusablePrompt: typeof record.reusablePrompt === "string" ? record.reusablePrompt : typeof record.reusable_prompt === "string" ? record.reusable_prompt : null,
    extractionError: typeof record.extractionError === "string" ? record.extractionError : typeof record.extraction_error === "string" ? record.extraction_error : null,
  };
}

export function grantIntelligenceFromDb(row: GrantIntelligenceDbRow): GrantIntelligence {
  return normalizeGrantIntelligence({
    status: row.status,
    model: row.model,
    confidence: row.confidence,
    reusable_summary: row.reusable_summary,
    extracted_criteria: row.extracted_criteria,
    eligibility_criteria: row.eligibility_criteria,
    hard_gates: row.hard_gates,
    applicant_types: row.applicant_types,
    sectors: row.sectors,
    regions: row.regions,
    funding_purposes: row.funding_purposes,
    semantic_tags: row.semantic_tags,
    measurable_requirements: row.measurable_requirements,
    exclusions: row.exclusions,
    freshness: row.freshness,
    scoring_hints: row.scoring_hints,
    reusable_prompt: row.reusable_prompt,
    extraction_error: row.extraction_error,
  });
}

export function grantIntelligenceToDb(intelligence: GrantIntelligence) {
  return {
    status: intelligence.status,
    model: intelligence.model,
    confidence: intelligence.confidence,
    reusable_summary: intelligence.reusableSummary,
    extracted_criteria: intelligence.extractedCriteria,
    eligibility_criteria: intelligence.eligibilityCriteria,
    hard_gates: intelligence.hardGates,
    applicant_types: intelligence.applicantTypes,
    sectors: intelligence.sectors,
    regions: intelligence.regions,
    funding_purposes: intelligence.fundingPurposes,
    semantic_tags: intelligence.semanticTags,
    measurable_requirements: intelligence.measurableRequirements,
    exclusions: intelligence.exclusions,
    freshness: intelligence.freshness,
    scoring_hints: intelligence.scoringHints,
    reusable_prompt: intelligence.reusablePrompt,
    extraction_error: intelligence.extractionError,
  };
}

export function isReadyGrantIntelligence(intelligence: GrantIntelligence | null | undefined): intelligence is GrantIntelligence {
  return Boolean(intelligence && intelligence.status === "ready" && intelligence.reusableSummary);
}
