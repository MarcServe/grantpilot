/**
 * Layer 1: Rule-based heuristic scoring.
 * Eliminates 80-95% of grant-profile pairs before any AI call.
 * Pure logic, zero cost.
 */

interface HeuristicProfile {
  location: string;
  sector: string;
  fundingMin: number;
  fundingMax: number;
  fundingPurposes: string[];
  employeeCount: number | null;
  annualRevenue: number | null;
  businessType: string | null;
}

interface HeuristicGrant {
  id: string;
  amount?: number | null;
  deadline?: string | null;
  eligibility: string;
  sectors: string[];
  regions: string[];
  applicantTypes?: string[];
  description?: string | null;
  objectives?: string | null;
}

export interface HeuristicResult {
  grantId: string;
  score: number;
  passed: boolean;
  reasons: string[];
}

const SECTOR_SYNONYMS: Record<string, string[]> = {
  technology: ["tech", "software", "digital", "it", "saas", "ai", "data", "cyber"],
  healthcare: ["health", "medical", "pharma", "biotech", "nhs", "life sciences", "wellbeing"],
  manufacturing: ["production", "industrial", "factory", "fabrication"],
  "creative industries": ["creative", "arts", "media", "design", "film", "music", "cultural"],
  energy: ["renewable", "clean energy", "green energy", "solar", "wind", "carbon", "net zero"],
  agriculture: ["farming", "agri", "agritech", "food production", "rural"],
  education: ["training", "learning", "edtech", "skills", "academic"],
  "financial services": ["finance", "fintech", "banking", "insurance"],
  retail: ["ecommerce", "e-commerce", "shop", "consumer", "wholesale"],
  construction: ["building", "infrastructure", "property", "housing"],
  "social enterprise": ["social", "charity", "community", "non-profit", "nonprofit", "cic"],
  "food & drink": ["food", "beverage", "hospitality", "catering"],
  tourism: ["travel", "hospitality", "leisure", "visitor"],
  defence: ["defense", "military", "security"],
};

const BUSINESS_TYPE_SYNONYMS: Record<string, string[]> = {
  "sme": ["sme", "small", "micro", "medium", "business", "limited", "ltd"],
  "startup": ["startup", "start-up", "early stage", "pre-revenue", "early-stage"],
  "sole trader": ["sole trader", "sole proprietor", "freelance", "self-employed", "individual"],
  "charity / non-profit": ["charity", "non-profit", "nonprofit", "ngo", "voluntary", "third sector", "not-for-profit"],
  "social enterprise": ["social enterprise", "cic", "community interest", "social business"],
  "university / research": ["university", "research", "academic", "higher education", "institution", "rto"],
  "public sector": ["public sector", "government", "local authority", "council", "public body", "nhs"],
  "large enterprise": ["large enterprise", "corporate", "multinational", "plc", "large company", "large business"],
  "partnership": ["partnership", "llp", "joint venture"],
};

function businessTypeMatchesGrant(profileType: string | null, grantApplicantTypes: string[]): "match" | "mismatch" | "neutral" {
  if (!profileType || grantApplicantTypes.length === 0) return "neutral";

  const ptLower = normText(profileType);
  const synonyms = BUSINESS_TYPE_SYNONYMS[ptLower] ?? [ptLower];

  for (const grantType of grantApplicantTypes) {
    const gt = normText(grantType);
    if (/\b(any|all|open|eligible)\b/.test(gt)) return "match";
    if (synonyms.some((s) => gt.includes(s) || s.includes(gt))) return "match";
    const grantSynonyms = Object.entries(BUSINESS_TYPE_SYNONYMS).find(
      ([, syns]) => syns.some((s) => gt.includes(s))
    );
    if (grantSynonyms && grantSynonyms[0] === ptLower) return "match";
  }

  return "mismatch";
}

function normText(s: string): string {
  return s.toLowerCase().trim();
}

function sectorMatches(profileSector: string, grantSectors: string[], grantText: string): boolean {
  if (grantSectors.length === 0) return true;

  const ps = normText(profileSector);
  if (!ps) return true;

  const synonyms = SECTOR_SYNONYMS[ps] ?? [];
  const terms = [ps, ...synonyms];

  for (const gs of grantSectors) {
    const gn = normText(gs);
    if (terms.some((t) => gn.includes(t) || t.includes(gn))) return true;
    if (gn === "all" || gn === "any" || gn === "open") return true;
  }

  const gt = normText(grantText);
  if (gt && terms.some((t) => gt.includes(t))) return true;

  return false;
}

function regionMatches(profileLocation: string, grantRegions: string[]): boolean {
  if (grantRegions.length === 0) return true;

  const loc = normText(profileLocation);
  if (!loc) return true;

  const ukTerms = ["uk", "united kingdom", "england", "scotland", "wales", "northern ireland", "london", "manchester", "birmingham", "bristol", "leeds", "liverpool", "sheffield", "edinburgh", "glasgow", "cardiff", "belfast"];
  const usTerms = ["us", "usa", "united states", "america"];
  const euTerms = ["eu", "europe", "germany", "france", "spain", "italy", "netherlands"];

  const isUK = ukTerms.some((t) => loc.includes(t));
  const isUS = usTerms.some((t) => loc.includes(t));
  const isEU = euTerms.some((t) => loc.includes(t));

  for (const r of grantRegions) {
    const rn = normText(r);
    if (rn === "national" || rn === "global" || rn === "international" || rn === "worldwide") return true;
    if (isUK && (rn.includes("uk") || rn.includes("united kingdom") || rn.includes("england") || rn.includes("scotland") || rn.includes("wales"))) return true;
    if (isUS && (rn.includes("us") || rn.includes("united states") || rn.includes("america"))) return true;
    if (isEU && (rn.includes("eu") || rn.includes("europe"))) return true;
    if (loc.includes(rn) || rn.includes(loc.split(",")[0]?.trim() ?? "")) return true;
  }

  return false;
}

function fundingRangeOverlaps(profileMin: number, profileMax: number, grantAmount: number | null | undefined): boolean {
  if (grantAmount == null || grantAmount <= 0) return true;
  if (profileMin <= 0 && profileMax <= 0) return true;
  const effectiveMax = profileMax > 0 ? profileMax : Infinity;
  return grantAmount >= profileMin * 0.5 && grantAmount <= effectiveMax * 3;
}

function deadlineIsValid(deadline: string | null | undefined): boolean {
  if (!deadline) return true;
  try {
    return new Date(deadline) > new Date();
  } catch {
    return true;
  }
}

export function scoreGrantHeuristic(
  profile: HeuristicProfile,
  grant: HeuristicGrant
): HeuristicResult {
  let score = 0;
  const reasons: string[] = [];
  const grantText = [grant.eligibility, grant.description, grant.objectives].filter(Boolean).join(" ");

  if (!deadlineIsValid(grant.deadline)) {
    return { grantId: grant.id, score: 0, passed: false, reasons: ["Deadline passed"] };
  }

  if (regionMatches(profile.location, grant.regions)) {
    score += 20;
    reasons.push("Region match");
  } else {
    return { grantId: grant.id, score, passed: false, reasons: ["Region mismatch"] };
  }

  if (fundingRangeOverlaps(profile.fundingMin, profile.fundingMax, grant.amount)) {
    score += 20;
    reasons.push("Funding range compatible");
  } else {
    score += 5;
    reasons.push("Funding range mismatch (partial)");
  }

  if (sectorMatches(profile.sector, grant.sectors, grantText)) {
    score += 25;
    reasons.push("Sector match");
  } else {
    score += 5;
    reasons.push("Sector mismatch (partial)");
  }

  const purposeText = profile.fundingPurposes.map(normText);
  const eligText = normText(grantText);
  const purposeHits = purposeText.filter((p) => {
    const words = p.split(/[\s&,]+/).filter((w) => w.length > 3);
    return words.some((w) => eligText.includes(w));
  });
  if (purposeHits.length > 0) {
    score += 15;
    reasons.push("Purpose alignment");
  } else {
    score += 5;
  }

  const typeResult = businessTypeMatchesGrant(profile.businessType, grant.applicantTypes ?? []);
  if (typeResult === "match") {
    score += 15;
    reasons.push("Applicant type match");
  } else if (typeResult === "mismatch") {
    score -= 20;
    reasons.push("Applicant type mismatch");
  } else {
    score += 10;
  }

  if (profile.employeeCount != null && grant.eligibility) {
    const smeMatch = /\b(sme|small|medium|micro)\b/i.test(grant.eligibility);
    const largeOnly = /\b(large enterprise|corporate|multinational)\b/i.test(grant.eligibility) && !smeMatch;
    if (largeOnly && profile.employeeCount < 250) {
      score -= 10;
      reasons.push("May require large enterprise");
    }
  }

  const PASS_THRESHOLD = 30;
  return {
    grantId: grant.id,
    score: Math.max(0, Math.min(100, score)),
    passed: score >= PASS_THRESHOLD,
    reasons,
  };
}

export function preFilterGrants(
  profile: HeuristicProfile,
  grants: HeuristicGrant[]
): HeuristicResult[] {
  return grants
    .map((g) => scoreGrantHeuristic(profile, g))
    .filter((r) => r.passed)
    .sort((a, b) => b.score - a.score);
}
