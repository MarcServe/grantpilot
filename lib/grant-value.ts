import { resolveGrantCurrency, formatCurrencyAmount, type GrantCurrencyInput } from "@/lib/grant-currency";
export type GrantValueInput = GrantCurrencyInput & {
  amount?: number | null;
  effort?: { amount?: number | null } | null;
  fundingValue?: GrantFundingValue | null;
  fundingValueType?: string | null;
  applicantMaxAmount?: number | null;
  applicantTypicalAmount?: number | null;
  programmeTotalAmount?: number | null;
  fundingValueEvidence?: string | null;
};

export type FundingValueType =
  "applicant_max" | "applicant_typical" | "programme_total" | "unknown";

export type GrantFundingValue = {
  currency?: string | null;
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
  currencyTotals: { currency: string; total: number; count: number }[];
  listedCurrencyTotals: { currency: string; total: number; count: number }[];
  unknownCurrencyCount: number;
};

function cleanAmount(value: unknown): number | null {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function normalizeFundingValueType(value: unknown): FundingValueType {
  const text = String(value ?? "")
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
  if (
    text === "applicant_typical" ||
    text === "typical_applicant_award" ||
    text === "typical_award"
  )
    return "applicant_typical";
  if (
    text === "programme_total" ||
    text === "program_total" ||
    text === "total_programme_fund"
  )
    return "programme_total";
  if (
    text === "applicant_max" ||
    text === "max_award" ||
    text === "maximum_award"
  )
    return "applicant_max";
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
  return { ...resolveFundingBasis(grant), currency: resolveGrantCurrency(grant) };
}

function resolveFundingBasis(grant: GrantValueInput): GrantFundingValue {
  if (grant.fundingValue) {
    const type = normalizeFundingValueType(grant.fundingValue.type);
    const amount = cleanAmount(grant.fundingValue.amount);
    return {
      amount,
      type,
      label: grant.fundingValue.label || labelForFundingValueType(type),
      countsTowardApplicantTotal: countsTowardApplicantTotal(type),
      evidence:
        grant.fundingValue.evidence ?? grant.fundingValueEvidence ?? null,
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

  const programme = cleanAmount(grant.programmeTotalAmount);
  const legacy = cleanAmount(grant.amount ?? grant.effort?.amount);
  if (legacy != null && (normalizeFundingValueType(grant.fundingValueType) !== "unknown" || programme == null)) {
    const type = normalizeFundingValueType(grant.fundingValueType);
    const finalType = type;
    return {
      // Keep historical values visible without treating them as verified awards.
      amount: legacy,
      type: finalType,
      label: finalType === "unknown" ? "Listed funding amount (unverified)" : labelForFundingValueType(finalType),
      countsTowardApplicantTotal: countsTowardApplicantTotal(finalType),
      evidence: grant.fundingValueEvidence ?? null,
    };
  }

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

export function summarizeGrantValues(
  grants: GrantValueInput[],
): GrantValueSummary {
  let knownCount = 0;
  let unknownCount = 0;
  let unknownCurrencyCount = 0;
  const confirmed = new Map<string, { currency: string; total: number; count: number }>();
  const listed = new Map<string, { currency: string; total: number; count: number }>();
  for (const grant of grants) {
    const value = resolveGrantFundingValue(grant);
    const currency = value.currency ?? null;
    if (value.amount != null && !currency) unknownCurrencyCount++;
    if (value.countsTowardApplicantTotal && value.amount != null) knownCount++;
    else unknownCount++;
    if (value.amount == null || !currency || value.type === "programme_total") continue;
    const groups = value.countsTowardApplicantTotal ? confirmed : listed;
    const group = groups.get(currency) ?? { currency, total: 0, count: 0 };
    group.total += value.amount; group.count++;
    groups.set(currency, group);
  }
  const currencyTotals = [...confirmed.values()].sort((a, b) => a.currency.localeCompare(b.currency));
  const listedCurrencyTotals = [...listed.values()].sort((a, b) => a.currency.localeCompare(b.currency));
  return {
    // Compatibility value exists only for a single confirmed currency; never sum currencies.
    total: currencyTotals.length === 1 ? currencyTotals[0].total : 0,
    knownCount, unknownCount, totalCount: grants.length,
    currencyTotals, listedCurrencyTotals, unknownCurrencyCount,
  };
}

export function grantCurrencyTotalLines(summary: GrantValueSummary): string[] {
  return [
    ...summary.currencyTotals.map(group => `${formatCurrencyAmount(group.total, group.currency)} · ${group.count} confirmed award values`),
    ...summary.listedCurrencyTotals.map(group => `${formatCurrencyAmount(group.total, group.currency)} listed · ${group.count} values; award terms unverified`),
    ...(summary.unknownCurrencyCount ? [`${summary.unknownCurrencyCount} values have unconfirmed currency; excluded from totals`] : []),
  ];
}

export function formatCurrencyCompact(amount: number, currency: string | null = null): string {
  if (!Number.isFinite(amount) || amount <= 0) return "Value unknown";

  return amount.toLocaleString("en-GB", {
    ...(currency ? { style: "currency" as const, currency, currencyDisplay: "code" as const } : {}),
    maximumFractionDigits: 0,
    notation: amount >= 1_000_000 ? "compact" : "standard",
  });
}

export function formatGrantValue(amount?: number | null, currency: string | null = null): string {
  const value =
    typeof amount === "number" && Number.isFinite(amount) && amount > 0
      ? amount
      : null;
  return value == null
    ? "Award amount not confirmed"
    : `Listed ${formatCurrencyAmount(value, currency)}`;
}

export function formatGrantFundingValue(
  value?: GrantFundingValue | number | null,
): string {
  if (typeof value === "number" || value == null)
    return formatGrantValue(value);
  if (value.amount == null) return "Award amount not confirmed";
  const amount = formatCurrencyAmount(value.amount, value.currency ?? null);
  if (value.type === "unknown")
    return `Listed ${amount} · verify terms`;
  if (value.type === "applicant_typical")
    return `Typical ${amount}`;
  if (value.type === "programme_total")
    return `${amount} programme fund`;
  return `Up to ${amount}`;
}

export function formatGrantValueSummary(summary: GrantValueSummary): string {
  return summary.currencyTotals.length
    ? summary.currencyTotals.map(group => formatCurrencyAmount(group.total, group.currency)).join(" · ")
    : "Confirmed currency totals unavailable";
}

export function grantValueSummaryDetail(summary: GrantValueSummary): string {
  if (summary.totalCount === 0) return "No grants loaded yet";
  if (summary.knownCount === 0)
    return `${summary.totalCount} loaded, individual award values unconfirmed`;
  if (summary.unknownCount === 0) return `${summary.knownCount} known values`;
  return `${summary.knownCount} known values, ${summary.unknownCount} unconfirmed`;
}

export function comparableAwardAverages(
  grants: (GrantValueInput & {
    currency?: string | null;
    opportunityType?: string | null;
  })[],
) {
  const groups = new Map<
    string,
    {
      currency: string;
      type: string;
      basis: string;
      total: number;
      count: number;
    }
  >();
  for (const grant of grants) {
    const value = resolveGrantFundingValue(grant);
    if (
      !value.countsTowardApplicantTotal ||
      value.amount == null ||
      !value.currency ||
      !grant.opportunityType
    )
      continue;
    const key = `${value.currency}:${grant.opportunityType}:${value.type}`;
    const group = groups.get(key) ?? {
      currency: value.currency!,
      type: grant.opportunityType,
      basis: value.type,
      total: 0,
      count: 0,
    };
    group.total += value.amount;
    group.count++;
    groups.set(key, group);
  }
  return [...groups.values()].map((g) => ({
    ...g,
    average: g.total / g.count,
  }));
}
