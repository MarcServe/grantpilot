export type GrantValueInput = {
  amount?: number | null;
  effort?: { amount?: number | null } | null;
  fundingValue?: GrantFundingValue | null;
  fundingValueType?: string | null;
  applicantMaxAmount?: number | null;
  applicantTypicalAmount?: number | null;
  programmeTotalAmount?: number | null;
  fundingValueEvidence?: string | null;
};

export type FundingValueType = "applicant_max" | "applicant_typical" | "programme_total" | "unknown";

export type GrantFundingValue = {
  amount: number | null;
  type: FundingValueType;
  label: string;
  countsTowardApplicantTotal: boolean;
  evidence?: string | null;
};

export type GrantValueSummary = {
  total: number;
  knownCount: number;
  unknownCount: number;
  totalCount: number;
};

function cleanAmount(value: unknown): number | null {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function normalizeFundingValueType(value: unknown): FundingValueType {
  const text = String(value ?? "").toLowerCase().replace(/[-\s]+/g, "_");
  if (text === "applicant_typical" || text === "typical_applicant_award" || text === "typical_award") return "applicant_typical";
  if (text === "programme_total" || text === "program_total" || text === "total_programme_fund") return "programme_total";
  if (text === "applicant_max" || text === "max_award" || text === "maximum_award") return "applicant_max";
  return "unknown";
}

function labelForFundingValueType(type: FundingValueType): string {
  if (type === "applicant_typical") return "Typical applicant award";
  if (type === "applicant_max") return "Applicant maximum";
  if (type === "programme_total") return "Programme-wide fund";
  return "Funding value";
}

function countsTowardApplicantTotal(type: FundingValueType): boolean {
  return type === "applicant_max" || type === "applicant_typical";
}

export function resolveGrantFundingValue(grant: GrantValueInput): GrantFundingValue {
  if (grant.fundingValue) {
    const type = normalizeFundingValueType(grant.fundingValue.type);
    const amount = cleanAmount(grant.fundingValue.amount);
    return {
      amount,
      type,
      label: grant.fundingValue.label || labelForFundingValueType(type),
      countsTowardApplicantTotal: grant.fundingValue.countsTowardApplicantTotal ?? countsTowardApplicantTotal(type),
      evidence: grant.fundingValue.evidence ?? grant.fundingValueEvidence ?? null,
    };
  }

  const typical = cleanAmount(grant.applicantTypicalAmount);
  if (typical != null) {
    return {
      amount: typical,
      type: "applicant_typical",
      label: labelForFundingValueType("applicant_typical"),
      countsTowardApplicantTotal: true,
      evidence: grant.fundingValueEvidence ?? null,
    };
  }

  const max = cleanAmount(grant.applicantMaxAmount);
  if (max != null) {
    return {
      amount: max,
      type: "applicant_max",
      label: labelForFundingValueType("applicant_max"),
      countsTowardApplicantTotal: true,
      evidence: grant.fundingValueEvidence ?? null,
    };
  }

  const legacy = cleanAmount(grant.amount ?? grant.effort?.amount);
  if (legacy != null) {
    const type = normalizeFundingValueType(grant.fundingValueType);
    const finalType = type === "programme_total" ? "programme_total" : "applicant_max";
    return {
      amount: legacy,
      type: finalType,
      label: labelForFundingValueType(finalType),
      countsTowardApplicantTotal: countsTowardApplicantTotal(finalType),
      evidence: grant.fundingValueEvidence ?? null,
    };
  }

  const programme = cleanAmount(grant.programmeTotalAmount);
  if (programme != null) {
    return {
      amount: programme,
      type: "programme_total",
      label: labelForFundingValueType("programme_total"),
      countsTowardApplicantTotal: false,
      evidence: grant.fundingValueEvidence ?? null,
    };
  }

  return {
    amount: null,
    type: "unknown",
    label: labelForFundingValueType("unknown"),
    countsTowardApplicantTotal: false,
    evidence: grant.fundingValueEvidence ?? null,
  };
}

export function grantKnownAmount(grant: GrantValueInput): number | null {
  const funding = resolveGrantFundingValue(grant);
  return funding.countsTowardApplicantTotal ? funding.amount : null;
}

export function summarizeGrantValues(grants: GrantValueInput[]): GrantValueSummary {
  let total = 0;
  let knownCount = 0;
  let unknownCount = 0;

  for (const grant of grants) {
    const amount = grantKnownAmount(grant);
    if (amount == null) {
      unknownCount += 1;
      continue;
    }
    total += amount;
    knownCount += 1;
  }

  return {
    total,
    knownCount,
    unknownCount,
    totalCount: grants.length,
  };
}

export function formatCurrencyCompact(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "Value unknown";

  return amount.toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
    notation: amount >= 1_000_000 ? "compact" : "standard",
  });
}

export function formatGrantValue(amount?: number | null): string {
  const value = typeof amount === "number" && Number.isFinite(amount) && amount > 0 ? amount : null;
  return value == null ? "Funding varies" : `Up to ${formatCurrencyCompact(value)}`;
}

export function formatGrantFundingValue(value?: GrantFundingValue | number | null): string {
  if (typeof value === "number" || value == null) return formatGrantValue(value);
  if (value.amount == null) return "Funding varies";
  if (value.type === "applicant_typical") return `Typical ${formatCurrencyCompact(value.amount)}`;
  if (value.type === "programme_total") return `${formatCurrencyCompact(value.amount)} programme fund`;
  return `Up to ${formatCurrencyCompact(value.amount)}`;
}

export function formatGrantValueSummary(summary: GrantValueSummary): string {
  return summary.knownCount > 0 ? formatCurrencyCompact(summary.total) : "Value unknown";
}

export function grantValueSummaryDetail(summary: GrantValueSummary): string {
  if (summary.totalCount === 0) return "No grants loaded yet";
  if (summary.knownCount === 0) return `${summary.totalCount} loaded, award amounts not stated`;
  if (summary.unknownCount === 0) return `${summary.knownCount} known values`;
  return `${summary.knownCount} known values, ${summary.unknownCount} unstated`;
}
