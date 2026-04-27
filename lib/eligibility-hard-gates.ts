export interface ApplicantTypeGateGrant {
  eligibility?: string | null;
  applicantTypes?: string[] | null;
}

export interface ApplicantTypeGateResult {
  requiredTypes: string[];
  profileMatches: boolean;
  reason: string;
}

const APPLICANT_REQUIREMENT_TERMS: Record<string, RegExp> = {
  "charity / non-profit": /\b(charit(?:y|ies|able)|non[-\s]?profit|not[-\s]?for[-\s]?profit|ngo|voluntary|third sector)\b/i,
  "social enterprise": /\b(social enterprise|community interest compan(?:y|ies)|\bcic\b)\b/i,
};

const PROFILE_TYPE_TERMS: Record<string, RegExp> = {
  "charity / non-profit": /\b(charit(?:y|ies|able)|non[-\s]?profit|not[-\s]?for[-\s]?profit|ngo|voluntary|third sector)\b/i,
  "social enterprise": /\b(social enterprise|community interest compan(?:y|ies)|\bcic\b)\b/i,
};

const BROAD_APPLICANT_TERMS = /\b(sme|small business(?:es)?|business(?:es)?|compan(?:y|ies)|startup|start-up|sole trader|limited compan(?:y|ies)|\bltd\b|private sector)\b/i;
const RESTRICTIVE_CONTEXT = /\b(open to|eligible (?:to|for)|restricted to|only|must be|applicants? (?:must be|are|should be)|available to|for)\b/i;

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function applicantTypesFromText(text: string): string[] {
  return Object.entries(APPLICANT_REQUIREMENT_TERMS)
    .filter(([, pattern]) => pattern.test(text))
    .map(([type]) => type);
}

function profileMatchesRequiredTypes(profileBusinessType: string | null | undefined, requiredTypes: string[]): boolean {
  const profileType = profileBusinessType?.trim() ?? "";
  if (!profileType) return false;
  return requiredTypes.some((type) => {
    const pattern = PROFILE_TYPE_TERMS[type];
    return pattern ? pattern.test(profileType) : profileType.toLowerCase().includes(type.toLowerCase());
  });
}

export function getApplicantTypeGate(
  profileBusinessType: string | null | undefined,
  grant: ApplicantTypeGateGrant
): ApplicantTypeGateResult | null {
  const applicantTypes = grant.applicantTypes?.filter(Boolean) ?? [];
  const applicantTypesText = applicantTypes.join(" ");
  const eligibilityText = grant.eligibility ?? "";

  const explicitRequired = unique(applicantTypesFromText(applicantTypesText));
  const applicantTypesAllowBroadBusiness = BROAD_APPLICANT_TERMS.test(applicantTypesText);
  if (explicitRequired.length > 0 && !applicantTypesAllowBroadBusiness) {
    return {
      requiredTypes: explicitRequired,
      profileMatches: profileMatchesRequiredTypes(profileBusinessType, explicitRequired),
      reason: `Requires ${explicitRequired.join(" or ")}`,
    };
  }

  const textRequired = unique(applicantTypesFromText(eligibilityText));
  if (textRequired.length === 0) return null;

  const lowerEligibility = eligibilityText.toLowerCase();
  const hasRestrictiveContext = RESTRICTIVE_CONTEXT.test(lowerEligibility);
  const allowsBroadBusiness = BROAD_APPLICANT_TERMS.test(lowerEligibility);
  if (!hasRestrictiveContext || allowsBroadBusiness) return null;

  return {
    requiredTypes: textRequired,
    profileMatches: profileMatchesRequiredTypes(profileBusinessType, textRequired),
    reason: `Requires ${textRequired.join(" or ")}`,
  };
}
