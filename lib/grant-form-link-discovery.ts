/**
 * Fetch a programme/info page and find the best direct application form URL
 * (e.g. "Apply" link to Airtable, Typeform) so the worker can open the form directly.
 */

import { isLikelyApplicationFormUrl } from "./grant-url-validation";

const CRAWL_TIMEOUT_MS = 15_000;
const USER_AGENT = "Grants-Copilot/1.0 (grant form link discovery)";

/** Apply-link text patterns (case-insensitive). */
const APPLY_PATTERNS = [
  /apply\s+(for|now|here)/i,
  /application\s+(form|link)/i,
  /apply\s+for\s+climate/i,
  /applications\s+open/i,
  /^apply$/i,
  /^applications$/i,
  /submit\s+(your\s+)?application/i,
];

/** href patterns that suggest a form (path or host). */
const FORM_URL_PATTERNS = [
  /airtable\.com\/.+\/form/i,
  /typeform\.com\/to\//i,
  /forms\.gle\//i,
  /docs\.google\.com\/forms/i,
  /\/form\b/i,
  /\/apply\b/i,
  /\/application/i,
];

function linkTextSuggestsApply(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length > 120) return false;
  return APPLY_PATTERNS.some((p) => p.test(t));
}

function hrefSuggestsForm(href: string): boolean {
  if (isLikelyApplicationFormUrl(href)) return true;
  return FORM_URL_PATTERNS.some((p) => p.test(href));
}

/**
 * Parse HTML and extract <a href="..."> links. Returns href and link text.
 * Handles quoted attributes and simple tags.
 */
function extractLinks(html: string, baseUrl: string): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = [];
  const base = new URL(baseUrl);
  const re = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const rawHref = m[1].trim();
    const rawText = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    try {
      const resolved = new URL(rawHref, base.origin);
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
      out.push({ href: resolved.href, text: rawText });
    } catch {
      // skip invalid URLs
    }
  }
  return out;
}

/**
 * From a programme page HTML, find the best candidate URL for the application form.
 * Prefers links whose text looks like "Apply" and whose href is a known form URL.
 */
export function discoverFormLinkFromHtml(html: string, pageUrl: string): string | null {
  const links = extractLinks(html, pageUrl);

  // First: link that is clearly a form URL and has apply-like text
  for (const { href, text } of links) {
    if (isLikelyApplicationFormUrl(href) && linkTextSuggestsApply(text)) return href;
  }

  // Second: any link that is a known form URL
  for (const { href } of links) {
    if (isLikelyApplicationFormUrl(href)) return href;
  }

  // Third: link with apply-like text and href that looks like a form
  for (const { href, text } of links) {
    if (linkTextSuggestsApply(text) && hrefSuggestsForm(href)) return href;
  }

  // Fourth: any href that strongly suggests a form (path/host)
  for (const { href } of links) {
    if (hrefSuggestsForm(href)) return href;
  }

  return null;
}

/**
 * Fetch the page at pageUrl and discover the direct application form URL, if any.
 */
export async function discoverFormLink(pageUrl: string): Promise<{ formUrl: string | null; error?: string }> {
  try {
    const res = await fetch(pageUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(CRAWL_TIMEOUT_MS),
    });
    if (!res.ok) {
      const msg =
        res.status === 404
          ? "Page returned 404 (Not Found). The programme URL may be wrong or the page may have been moved."
          : `Page returned HTTP ${res.status}.`;
      return { formUrl: null, error: msg };
    }
    const html = await res.text();
    const formUrl = discoverFormLinkFromHtml(html, pageUrl);
    return { formUrl };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { formUrl: null, error: message };
  }
}
