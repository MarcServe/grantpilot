import { isGrantAggregatorUrl, isVerifiedApplicationQuality } from "@/lib/grant-application-url-quality";

// Exact-record correction, verified against the funder's published competition.
// Do not match by a loose title: later phases and similarly named calls differ.
const SOURCE_CORRECTIONS: Record<string, string> = {
  c10e491028ac6ce7ca05b7331cd2ca943: "https://apply-for-innovation-funding.service.gov.uk/competition/2584/overview/4c7afb5d-4572-4ef2-9507-73ef2dec8ec8",
};
export function correctedGrantSourceUrl(id?: string | null): string | null {
  return id ? SOURCE_CORRECTIONS[id] ?? null : null;
}
export function grantWebPage(raw?: string | null): string | null {
  try {
    const url = new URL(raw?.trim() ?? "");
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || /(^|\.)grantscopilot\.com$/i.test(url.hostname) || /\.(png|jpe?g|gif|webp|svg|pdf)(?:$)/i.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}
export function isRecognisedFunderUrl(raw?: string | null): boolean {
  const page = grantWebPage(raw); if (!page) return false;
  return /(^|\.)(gov\.uk|ukri\.org|europa\.eu|grants\.gov|nsf\.gov|nih\.gov)$/i.test(new URL(page).hostname);
}
export function resolveGrantSourceLinks(grant: {
  id?: string | null; grantId?: string | null; detailUrl?: string | null;
  applicationUrl?: string | null; directApplicationUrl?: string | null; applicationUrlQuality?: string | null;
}) {
  const corrected = correctedGrantSourceUrl(grant.id ?? grant.grantId);
  const detail = grantWebPage(grant.detailUrl); const legacy = grantWebPage(grant.applicationUrl);
  const direct = grantWebPage(grant.directApplicationUrl);
  const candidates = [...new Set([detail, legacy, direct].filter((url): url is string => !!url))];
  const applicationUrl = isVerifiedApplicationQuality(grant.applicationUrlQuality)
    ? [direct, legacy].find((url): url is string => !!url && !isGrantAggregatorUrl(url)) ?? null : null;
  const sourceUrl = corrected ?? candidates.find(isRecognisedFunderUrl)
    ?? candidates.find(url => !isGrantAggregatorUrl(url)) ?? null;
  const discoveryUrl = candidates.find(isGrantAggregatorUrl) ?? null;
  return { sourceUrl, applicationUrl, discoveryUrl,
    isOfficial: !!sourceUrl && (sourceUrl === corrected || isRecognisedFunderUrl(sourceUrl)),
    discoveryOnly: !sourceUrl && !!discoveryUrl,
    label: sourceUrl ? (sourceUrl === corrected || isRecognisedFunderUrl(sourceUrl) ? "View official grant page" : "View grant information") : "View discovery listing",
  };
}
