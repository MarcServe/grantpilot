interface PreScreenProfile {
  employeeCount?: number | null;
  annualRevenue?: number | null;
  yearEstablished?: number | null;
}

interface PreScreenGrant {
  eligibility?: string | null;
  description?: string | null;
  objectives?: string | null;
}

export interface EligibilityPreScreenResult {
  passed: boolean;
  scoreCap: number | null;
  met: string[];
  gaps: string[];
  actions: string[];
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => cleanText(value)).filter(Boolean))];
}

function money(value: number): string {
  return `GBP ${Math.round(value).toLocaleString("en-GB")}`;
}

function parseAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  const normalized = raw.toLowerCase().replace(/,/g, "").replace(/\s+/g, "");
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return null;
  const multiplier = /(?:m|million|mn)\b/.test(normalized)
    ? 1_000_000
    : /(?:k|thousand)\b/.test(normalized)
      ? 1_000
      : 1;
  return Math.round(base * multiplier);
}

function firstNumber(patterns: RegExp[], text: string): number | null {
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (!match?.[1]) continue;
    const value = Number(match[1].replace(/,/g, ""));
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function firstAmount(patterns: RegExp[], text: string): number | null {
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    const amount = parseAmount(match?.[1]);
    if (amount != null) return amount;
  }
  return null;
}

function yearsFrom(value: string | undefined, unit: string | undefined): number | null {
  if (!value || !unit) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return /month/i.test(unit) ? n / 12 : n;
}

function firstAge(patterns: RegExp[], text: string): number | null {
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    const years = yearsFrom(match?.[1], match?.[2]);
    if (years != null) return years;
  }
  return null;
}

export function getCompanyAgeYears(yearEstablished?: number | null, asOf = new Date()): number | null {
  if (!yearEstablished || !Number.isFinite(yearEstablished)) return null;
  const currentYear = asOf.getFullYear();
  if (yearEstablished < 1800 || yearEstablished > currentYear) return null;
  return Math.max(0, currentYear - yearEstablished);
}

export function evaluateEligibilityPreScreen(
  profile: PreScreenProfile,
  grant: PreScreenGrant
): EligibilityPreScreenResult {
  const text = cleanText([grant.eligibility, grant.description, grant.objectives].filter(Boolean).join(" "));
  const lower = text.toLowerCase();
  const met: string[] = [];
  const gaps: string[] = [];
  const actions: string[] = [];
  let passed = true;
  let scoreCap: number | null = null;

  function cap(max: number) {
    scoreCap = scoreCap == null ? max : Math.min(scoreCap, max);
  }

  function hardGap(reason: string, action: string, max = 35) {
    passed = false;
    gaps.push(reason);
    actions.push(action);
    cap(max);
  }

  function softGap(reason: string, action: string, max = 60) {
    gaps.push(reason);
    actions.push(action);
    cap(max);
  }

  const minEmployees = firstNumber([
    /\b(?:at least|minimum|min\.?|over|more than)\s+(\d{1,5})\s+(?:employees|staff|fte|full[- ]time equivalents?)\b/i,
    /\b(?:employees|staff|fte)[^.;\n]{0,50}\b(?:at least|minimum|min\.?|over|more than)\s+(\d{1,5})\b/i,
  ], lower);
  const explicitMaxEmployees = firstNumber([
    /\b(?:under|below|less than|fewer than|no more than|up to|max(?:imum)?)\s+(\d{1,5})\s+(?:employees|staff|fte|full[- ]time equivalents?)\b/i,
    /\b(?:employees|staff|fte)[^.;\n]{0,50}\b(?:under|below|less than|fewer than|no more than|up to|max(?:imum)?)\s+(\d{1,5})\b/i,
  ], lower);
  const maxEmployees =
    explicitMaxEmployees ??
    (/\bsme\b|\bsmall and medium\b|\bsmall or medium\b/.test(lower) ? 250 : null);

  if (minEmployees != null) {
    if (profile.employeeCount == null) {
      softGap(`Employee count is required to check the funder's minimum of ${minEmployees}.`, "Add employee count to the business profile before treating this grant as a strong match.");
    } else if (profile.employeeCount < minEmployees) {
      hardGap(`Employee count below funder minimum: ${profile.employeeCount} of ${minEmployees}.`, "Do not recommend this grant as high fit until the company meets the funder's employee minimum.");
    } else {
      met.push(`Meets employee minimum (${profile.employeeCount}/${minEmployees}).`);
    }
  }

  if (maxEmployees != null && profile.employeeCount != null) {
    if (profile.employeeCount > maxEmployees) {
      hardGap(`Employee count exceeds funder limit: ${profile.employeeCount} over ${maxEmployees}.`, "Only recommend if the funder confirms larger organisations are eligible.");
    } else if (/\bsme\b|\bsmall and medium\b|\bsmall or medium\b/.test(lower)) {
      met.push(`Fits SME employee range (${profile.employeeCount}/${maxEmployees}).`);
    }
  }

  const amountToken = String.raw`([\u00a3$\u20ac]?\s*\d[\d,]*(?:\.\d+)?\s*(?:m|mn|k|million|thousand)?)`;
  const revenueTerms = String.raw`(?:annual\s+)?(?:revenue|turnover|income|sales|gross\s+revenue)`;
  const minRevenue = firstAmount([
    new RegExp(String.raw`\b(?:minimum|min\.?|at least|over|more than)\s+(?:of\s+)?${amountToken}\s+(?:in\s+)?${revenueTerms}\b`, "i"),
    new RegExp(String.raw`\b${revenueTerms}[^.;\n]{0,70}\b(?:minimum|min\.?|at least|over|more than|of)\s+${amountToken}\b`, "i"),
    new RegExp(String.raw`\b(?:minimum|min\.?|at least|over|more than)\s+${revenueTerms}[^.;\n]{0,50}${amountToken}\b`, "i"),
  ], lower);
  const maxRevenue = firstAmount([
    new RegExp(String.raw`\b(?:under|below|less than|no more than|up to|max(?:imum)?)\s+${amountToken}\s+(?:in\s+)?${revenueTerms}\b`, "i"),
    new RegExp(String.raw`\b${revenueTerms}[^.;\n]{0,70}\b(?:under|below|less than|no more than|up to|max(?:imum)?)\s+${amountToken}\b`, "i"),
  ], lower);

  if (minRevenue != null) {
    if (profile.annualRevenue == null) {
      softGap(`Annual revenue is required to check the funder's minimum of ${money(minRevenue)}.`, "Add annual revenue to the business profile before treating this grant as a strong match.");
    } else if (profile.annualRevenue < minRevenue) {
      hardGap(`Annual revenue below funder minimum: ${money(profile.annualRevenue)} of ${money(minRevenue)}.`, "Do not recommend this grant as high fit until revenue meets the funder's minimum threshold.");
    } else {
      met.push(`Meets revenue minimum (${money(profile.annualRevenue)} / ${money(minRevenue)}).`);
    }
  }

  if (maxRevenue != null) {
    if (profile.annualRevenue == null) {
      softGap(`Annual revenue is required to check the funder's revenue cap of ${money(maxRevenue)}.`, "Add annual revenue to the business profile before treating this grant as a strong match.");
    } else if (profile.annualRevenue > maxRevenue) {
      hardGap(`Annual revenue exceeds funder cap: ${money(profile.annualRevenue)} over ${money(maxRevenue)}.`, "Only recommend if the funder confirms higher-revenue applicants are eligible.");
    } else {
      met.push(`Fits revenue cap (${money(profile.annualRevenue)} / ${money(maxRevenue)}).`);
    }
  }

  if (/\bpre[- ]?revenue\b/.test(lower) && (profile.annualRevenue ?? 0) > 0) {
    softGap("Grant appears aimed at pre-revenue businesses, but the profile has recorded revenue.", "Check whether the funder accepts revenue-generating businesses before recommending as a strong fit.", 65);
  }

  const minAge = firstAge([
    /\b(?:trading|operating|registered|incorporated|established)[^.;\n]{0,60}\b(?:at least|minimum|min\.?|for)\s+(\d+(?:\.\d+)?)\s+(years?|months?)\b/i,
    /\b(?:at least|minimum|min\.?)\s+(\d+(?:\.\d+)?)\s+(years?|months?)[^.;\n]{0,60}\b(?:trading|operating|registered|incorporated|established)\b/i,
    /\b(\d+(?:\.\d+)?)\+?\s+(years?|months?)[^.;\n]{0,50}\b(?:trading|operating|registration|incorporation)\b/i,
  ], lower);
  const explicitMaxAge = firstAge([
    /\b(?:under|less than|below|no more than|up to|max(?:imum)?|younger than)\s+(\d+(?:\.\d+)?)\s+(years?|months?)\b/i,
    /\b(?:incorporated|registered|started|formed|launched)[^.;\n]{0,60}\b(?:within|in)\s+the\s+last\s+(\d+(?:\.\d+)?)\s+(years?|months?)\b/i,
  ], lower);
  const maxAge = explicitMaxAge ?? (/\bearly[- ]stage\b|\bstart[- ]?up\b|\bstartup\b/.test(lower) ? 5 : null);
  const companyAge = getCompanyAgeYears(profile.yearEstablished);

  if (minAge != null) {
    if (companyAge == null) {
      softGap(`Year established is required to check the funder's minimum trading age of ${minAge.toFixed(minAge % 1 ? 1 : 0)} years.`, "Add year established to the business profile before treating this grant as a strong match.");
    } else if (companyAge < minAge) {
      hardGap(`Company age below funder minimum: ${companyAge} years of ${minAge.toFixed(minAge % 1 ? 1 : 0)} years.`, "Prioritise earlier-stage grants until the business meets this funder's trading-age requirement.");
    } else {
      met.push(`Meets trading-age minimum (${companyAge} years).`);
    }
  }

  if (maxAge != null && companyAge != null) {
    if (companyAge > maxAge) {
      softGap(`Grant appears targeted at businesses up to ${maxAge.toFixed(maxAge % 1 ? 1 : 0)} years old; this profile is ${companyAge} years old.`, "Check whether the funder accepts more mature businesses before recommending as a strong fit.", 65);
    } else if (/\bearly[- ]stage\b|\bstart[- ]?up\b|\bstartup\b/.test(lower)) {
      met.push(`Fits early-stage company-age range (${companyAge} years).`);
    }
  }

  return {
    passed,
    scoreCap,
    met: unique(met),
    gaps: unique(gaps),
    actions: unique(actions),
  };
}
