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

/**
 * Returns true if the URL looks like a programme/info page (e.g. technation.io/programmes/climate/)
 * where the actual application might be linked from the page (e.g. "Apply" -> Airtable form).
 */
export function isLikelyProgrammeInfoUrl(url: string): boolean {
  if (isLikelyApplicationFormUrl(url)) return false;
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    return (
      path.includes("/programme") ||
      path.includes("/programmes/") ||
      path.includes("/opportunit") ||
      path.includes("/funding/") ||
      path.includes("/grant/") ||
      path.includes("/grants/")
    );
  } catch {
    return false;
  }
}
