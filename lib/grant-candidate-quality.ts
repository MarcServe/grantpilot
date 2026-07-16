import { createHash } from "crypto";

type GrantCandidateLike = {
  name?: string | null;
  title?: string | null;
  funder?: string | null;
  deadline?: string | Date | null;
  applicationUrl?: string | null;
  detailUrl?: string | null;
  directApplicationUrl?: string | null;
};

const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "gbraid",
  "wbraid",
  "mc_cid",
  "mc_eid",
  "msclkid",
  "igsh",
  "igshid",
  "ref",
  "ref_src",
  "campaign",
  "source",
]);

export function normalizeGrantTextKey(value?: string | null): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeGrantDeadlineKey(value?: string | Date | null): string {
  if (!value) return "";
  const parsed = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return normalizeGrantTextKey(String(value));
}

function shouldRemoveSearchParam(name: string): boolean {
  const lower = name.toLowerCase();
  return TRACKING_PARAMS.has(lower) || TRACKING_PARAM_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export function canonicalizeGrantUrl(value?: string | null): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }

    const entries = Array.from(url.searchParams.entries())
      .filter(([key]) => !shouldRemoveSearchParam(key))
      .sort(([a], [b]) => a.localeCompare(b));
    url.search = "";
    for (const [key, val] of entries) url.searchParams.append(key, val);

    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return raw
      .toLowerCase()
      .replace(/#.*$/, "")
      .replace(/[?&](utm_[^=&]+|fbclid|gclid|gbraid|wbraid|mc_cid|mc_eid|msclkid|igsh|igshid|ref|ref_src|campaign|source)=[^&]+/gi, "")
      .replace(/\/+$/, "");
  }
}

export function grantCandidateUrlCandidates(candidate: GrantCandidateLike): string[] {
  const urls = [
    candidate.directApplicationUrl,
    candidate.applicationUrl,
    candidate.detailUrl,
  ]
    .map(canonicalizeGrantUrl)
    .filter((url): url is string => Boolean(url));
  return Array.from(new Set(urls));
}

export function grantCandidateTextKey(candidate: GrantCandidateLike): string {
  const name = normalizeGrantTextKey(candidate.name ?? candidate.title ?? "");
  const funder = normalizeGrantTextKey(candidate.funder ?? "");
  const deadline = normalizeGrantDeadlineKey(candidate.deadline ?? null);
  return `${name}|${funder}|${deadline}`;
}

export function grantCandidateTextFingerprint(candidate: GrantCandidateLike): string {
  return createHash("sha256").update(grantCandidateTextKey(candidate)).digest("hex").slice(0, 32);
}

export function grantCandidateFingerprint(candidate: GrantCandidateLike): string {
  const urls = grantCandidateUrlCandidates(candidate);
  const payload = `${grantCandidateTextKey(candidate)}|${urls[0] ?? ""}`;
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}
