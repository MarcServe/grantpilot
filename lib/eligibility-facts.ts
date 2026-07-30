export const ELIGIBILITY_FACT_CATEGORIES = [
  "Legal / registration",
  "Trading history",
  "Financial evidence",
  "Property / premises",
  "Match funding",
  "Certification / compliance",
  "Ownership / leadership",
  "Partnerships",
  "Impact evidence",
  "Other",
] as const;

export const ELIGIBILITY_FACT_CONFIDENCE_VALUES = ["confirmed", "needs_evidence", "suggested"] as const;

export type EligibilityFactCategory = (typeof ELIGIBILITY_FACT_CATEGORIES)[number];
export type EligibilityFactConfidence = (typeof ELIGIBILITY_FACT_CONFIDENCE_VALUES)[number];

export type EligibilityFact = {
  id?: string;
  label: string;
  value: string;
  category?: EligibilityFactCategory | "";
  evidence?: string;
  source: "manual" | "ai_suggested";
  confidence: EligibilityFactConfidence;
  updatedAt?: string;
};

type EligibilityFactsTextOptions = {
  includeSuggested?: boolean;
  includeNeedsEvidence?: boolean;
};

function cleanText(value: unknown, max = 500): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeCategory(value: unknown): EligibilityFactCategory {
  const category = cleanText(value, 80);
  return ELIGIBILITY_FACT_CATEGORIES.includes(category as EligibilityFactCategory)
    ? (category as EligibilityFactCategory)
    : "Other";
}

export function normalizeEligibilityFacts(value: unknown): EligibilityFact[] {
  if (!Array.isArray(value)) return [];
  const facts: EligibilityFact[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const label = cleanText(raw.label, 120);
    const factValue = cleanText(raw.value, 500);
    if (!label || !factValue) continue;
    facts.push({
      id: cleanText(raw.id, 80) || crypto.randomUUID(),
      label,
      value: factValue,
      category: normalizeCategory(raw.category),
      evidence: cleanText(raw.evidence, 700),
      source: raw.source === "ai_suggested" ? "ai_suggested" : "manual",
      confidence: ELIGIBILITY_FACT_CONFIDENCE_VALUES.includes(raw.confidence as EligibilityFactConfidence)
        ? (raw.confidence as EligibilityFactConfidence)
        : "confirmed",
      updatedAt: cleanText(raw.updatedAt, 80) || new Date().toISOString(),
    });
  }
  return facts.slice(0, 40);
}

function factKey(fact: EligibilityFact): string {
  return `${fact.label}|${fact.value}`.toLowerCase().replace(/\s+/g, " ").trim();
}

export function mergeEligibilityFacts(existing: unknown, incoming: unknown): EligibilityFact[] {
  const merged = new Map<string, EligibilityFact>();
  for (const fact of normalizeEligibilityFacts(existing)) merged.set(factKey(fact), fact);
  for (const fact of normalizeEligibilityFacts(incoming)) {
    const previous = merged.get(factKey(fact));
    merged.set(factKey(fact), {
      ...previous,
      ...fact,
      id: previous?.id ?? fact.id ?? crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
    });
  }
  return [...merged.values()].slice(0, 40);
}

export function eligibilityFactsToText(
  value: unknown,
  limit = 12,
  options: EligibilityFactsTextOptions = { includeNeedsEvidence: true, includeSuggested: true }
): string {
  return normalizeEligibilityFacts(value)
    .filter((fact) => {
      if (fact.confidence === "confirmed") return true;
      if (fact.confidence === "needs_evidence") return Boolean(options.includeNeedsEvidence);
      if (fact.confidence === "suggested") return Boolean(options.includeSuggested);
      return false;
    })
    .slice(0, limit)
    .map((fact) => {
      const evidence = fact.evidence ? ` Evidence: ${fact.evidence}` : "";
      const confidence = fact.confidence && fact.confidence !== "confirmed" ? ` (${fact.confidence.replace("_", " ")})` : "";
      return `${fact.label}: ${fact.value}${confidence}.${evidence}`;
    })
    .join(" ");
}

export function confirmedEligibilityFactsToText(value: unknown, limit = 12): string {
  return eligibilityFactsToText(value, limit, {
    includeNeedsEvidence: false,
    includeSuggested: false,
  });
}
