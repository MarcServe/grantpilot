/**
 * Reject URLs that are clearly not direct grant application pages:
 * homepages, generic "for businesses" / "about" pages, or list-only portals.
 * Used by discovery and ingest so we don't store links that waste users' time.
 */

/** Path segments that indicate a generic org page, not a specific grant/application. */
const GENERIC_ORG_SEGMENTS = new Set([
  "",
  "index",
  "home",
  "information-for-businesses",
  "for-businesses",
  "for-residents",
  "about-us",
  "about",
  "what-we-do",
  "news",
  "search",
  "contact",
  "grants",
  "competitions",
  "funding",
  "schemes",
  "opportunities",
  "find-a-grant",
  "browse",
]);

/**
 * Returns true if the URL looks like a homepage or generic org page (not a direct application/grant page).
 * Rejects: empty path, or a single segment that's generic (e.g. /information-for-businesses).
 * Allows: /grants/some-slug, /funding/call-123 (multiple segments = specific page).
 */
export function looksLikeGenericOrListUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase().replace(/\/+$/, "");
    const segments = path.split("/").filter(Boolean);

    if (segments.length === 0) return true;
    if (segments.length >= 2) return false;

    return GENERIC_ORG_SEGMENTS.has(segments[0]);
  } catch {
    return true;
  }
}

/** Hosts that are typically application forms (Airtable, Typeform, Google Forms, etc.). */
const APPLICATION_FORM_HOSTS = new Set([
  "airtable.com",
  "www.airtable.com",
  "typeform.com",
  "www.typeform.com",
  "forms.gle",
  "docs.google.com",
  "survey",
  "form",
  "apply",
  "applications.",
]);

/**
 * Returns true if the URL is likely a direct application form (e.g. Airtable form, Typeform).
 * Used to prefer form URLs for the worker and to avoid crawling when we already have the form.
 */
export function isLikelyApplicationFormUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (APPLICATION_FORM_HOSTS.has(host)) return true;
    if (/^[a-z0-9-]*airtable\.com$/i.test(host)) return true;
    if (/^[a-z0-9-]*typeform\.com$/i.test(host)) return true;
    if (host.includes("google.com") && (u.pathname.includes("/forms/") || u.pathname.includes("form"))) return true;
    if (u.pathname.toLowerCase().includes("/form")) return true;
    return false;
  } catch {
    return false;
  }
}

/** Keywords that indicate a grant/funding programme page (path or host). */
const PROGRAMME_KEYWORDS = [
  "grant",
  "funding",
  "call",
  "programme",
  "program",
  "competition",
  "innovation",
  "apply",
  "fund",
  "opportunity",
  "opportunities",
  "award",
  "scheme",
  "initiative",
  "proposal",
  "fellowship",
  "research",
  "startup-support",
  "challenge",
  "accelerator",
  "open-call",
  "funding-calls",
  "current-funding",
  "grant-programmes",
];

/** Path segments that indicate an apply/application page. */
const APPLY_PATH_SEGMENTS = [
  "apply",
  "application",
  "applications",
  "submit",
  "register",
  "start-application",
  "open-call",
  "apply-now",
  "apply-online",
];

/** Domains that typically host grant programmes (substring match on hostname). */
const TRUSTED_GRANT_DOMAIN_PARTS = [
  "grants.gov",
  "service.gov.uk",
  "europa.eu",
  "find-government-grants",
  "apply-for-innovation-funding",
  "innovationfunding",
  "researchfunding",
  "openfunding",
  "fundingcalls",
  "funding-programmes",
  "competition.search",
  "researchprofessional.com",
  "funding.gov",
];

/**
 * Returns true if the URL's host is a known grant platform (e.g. service.gov.uk, grants.gov).
 */
export function isTrustedGrantDomain(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return TRUSTED_GRANT_DOMAIN_PARTS.some((part) => host.includes(part));
  } catch {
    return false;
  }
}

/**
 * Returns true if the URL points to a PDF (for routing to PDF extraction).
 */
export function isPdfUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    return path.endsWith(".pdf") || u.searchParams.get("format") === "pdf";
  } catch {
    return false;
  }
}

/**
 * Returns true if the URL looks like a programme/info page or apply page
 * (actual application may be linked from the page). Uses keywords, trusted domains, and path segments.
 */
export function isLikelyProgrammeInfoUrl(url: string): boolean {
  if (isLikelyApplicationFormUrl(url)) return false;
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    const host = u.hostname.toLowerCase();
    const pathAndHost = `${path} ${host}`;

    if (isTrustedGrantDomain(url)) return true;

    if (APPLY_PATH_SEGMENTS.some((seg) => path.includes(`/${seg}`) || path.includes(`/${seg}/`)))
      return true;

    return PROGRAMME_KEYWORDS.some((k) => pathAndHost.includes(k));
  } catch {
    return false;
  }
}
