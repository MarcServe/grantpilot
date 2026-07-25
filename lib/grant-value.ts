export type GrantValueInput = {
  amount?: number | null;
  effort?: { amount?: number | null } | null;
};

export type GrantValueSummary = {
  total: number;
  knownCount: number;
  unknownCount: number;
  totalCount: number;
};

export function grantKnownAmount(grant: GrantValueInput): number | null {
  const amount = grant.amount ?? grant.effort?.amount ?? null;
  return typeof amount === "number" && Number.isFinite(amount) && amount > 0 ? amount : null;
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

export function formatGrantValueSummary(summary: GrantValueSummary): string {
  return summary.knownCount > 0 ? formatCurrencyCompact(summary.total) : "Value unknown";
}

export function grantValueSummaryDetail(summary: GrantValueSummary): string {
  if (summary.totalCount === 0) return "No grants loaded yet";
  if (summary.knownCount === 0) return `${summary.totalCount} loaded, award amounts not stated`;
  if (summary.unknownCount === 0) return `${summary.knownCount} known values`;
  return `${summary.knownCount} known values, ${summary.unknownCount} unstated`;
}
