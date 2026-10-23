export type GrantCurrencyInput = {
  currency?: string | null;
  fundingValue?: { currency?: string | null; evidence?: string | null } | null;
  fundingValueEvidence?: string | null;
  description?: string | null; eligibility?: string | null; objectives?: string | null;
};
const supportedCurrencies = new Set(Intl.supportedValuesOf("currency"));
function validCode(value: unknown): string | null {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) && supportedCurrencies.has(code) ? code : null;
}
function mentionedCurrencies(text: string): string[] {
  const codes: string[] = [];
  const exact = validCode(text);
  if (exact) codes.push(exact);
  for (const match of text.matchAll(/\bcurrency\s*[:=]\s*([A-Z]{3})\b/gi)) {
    const code = validCode(match[1]);
    if (code) codes.push(code);
  }
  for (const match of text.matchAll(/\b([A-Z]{3})\s*(?=\d)|\d[\d,.]*\s*([A-Z]{3})\b/g)) {
    const code = match[1] ?? match[2];
    if (supportedCurrencies.has(code)) codes.push(code);
  }
  if (/£/.test(text)) codes.push("GBP");
  if (/€/.test(text)) codes.push("EUR");
  if (/\bUS\$/.test(text)) codes.push("USD");
  if (/\b(?:AU|A)\$/.test(text)) codes.push("AUD");
  if (/\b(?:CA|C)\$/.test(text)) codes.push("CAD");
  if (/\bNZ\$/.test(text)) codes.push("NZD");
  return [...new Set(codes)];
}
/** Never infer currency from the business's region or a bare dollar sign. */
export function resolveGrantCurrency(grant: GrantCurrencyInput): string | null {
  const declared = validCode(grant.currency) ?? validCode(grant.fundingValue?.currency);
  if (declared) return declared;
  const evidence = mentionedCurrencies(grant.fundingValueEvidence ?? grant.fundingValue?.evidence ?? "");
  if (evidence.length) return evidence.length === 1 ? evidence[0] : null;
  const context = mentionedCurrencies([grant.description, grant.eligibility, grant.objectives].filter(Boolean).join(" ").slice(0, 20000));
  return context.length === 1 ? context[0] : null;
}
export function formatCurrencyAmount(amount: number, currency: string | null): string {
  return currency ? new Intl.NumberFormat("en-GB", { style: "currency", currency, currencyDisplay: "code", maximumFractionDigits: 0 }).format(amount)
    : amount.toLocaleString("en-GB");
}
