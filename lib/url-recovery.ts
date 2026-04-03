/**
 * URL recovery: when a grant URL is flagged as dead, attempt to find
 * a working replacement by probing URL variations and crawling the
 * funder's domain for matching grant links.
 *
 * No LLM cost — pure HTTP probing.
 */

import { checkUrlHealth, type UrlStatus } from "./url-health-check";

const TIMEOUT_MS = 8_000;

interface RecoveryResult {
  found: boolean;
  newUrl?: string;
  method?: "variation" | "funder_crawl";
}

/**
 * Generate URL variations from a dead URL.
 * Strips trailing path segments, tries common grant portal paths.
 */
function generateVariations(deadUrl: string): string[] {
  try {
    const u = new URL(deadUrl);
    const variations: string[] = [];

    const segments = u.pathname.split("/").filter(Boolean);
    for (let i = segments.length - 1; i >= 1; i--) {
      variations.push(`${u.origin}/${segments.slice(0, i).join("/")}`);
    }

    const portalPaths = ["/grants", "/funding", "/apply", "/opportunities", "/competitions"];
    for (const path of portalPaths) {
      const candidate = `${u.origin}${path}`;
      if (!variations.includes(candidate)) variations.push(candidate);
    }

    return variations;
  } catch {
    return [];
  }
}

/**
 * Fetch a page and extract links whose text or href matches the grant name.
 */
async function findGrantLinksOnPage(
  pageUrl: string,
  grantName: string
): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(pageUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GrantPilotBot/1.0)",
        Accept: "text/html",
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return [];

    const html = await res.text();
    const linkRegex = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const matches: string[] = [];
    const nameLower = grantName.toLowerCase();
    const nameWords = nameLower.split(/\s+/).filter((w) => w.length > 3);

    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      const text = match[2].replace(/<[^>]+>/g, "").trim().toLowerCase();

      const wordMatches = nameWords.filter(
        (w) => text.includes(w) || href.toLowerCase().includes(w)
      );
      if (wordMatches.length >= Math.max(1, Math.floor(nameWords.length * 0.5))) {
        try {
          const resolved = new URL(href, pageUrl).toString();
          if (!matches.includes(resolved)) matches.push(resolved);
        } catch { /* skip malformed hrefs */ }
      }
    }
    return matches;
  } catch {
    clearTimeout(timeout);
    return [];
  }
}

/**
 * Attempt to recover a working URL for a grant with a dead link.
 * Returns the first working alternative found, or null.
 */
export async function attemptUrlRecovery(
  deadUrl: string,
  grantName: string,
  _funder: string
): Promise<RecoveryResult> {
  const variations = generateVariations(deadUrl);
  for (const candidate of variations.slice(0, 6)) {
    const health = await checkUrlHealth(candidate);
    if (health.status === "live") {
      return { found: true, newUrl: candidate, method: "variation" };
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  try {
    const baseUrl = new URL(deadUrl).origin;
    const portalPages = [baseUrl, `${baseUrl}/grants`, `${baseUrl}/funding`, `${baseUrl}/opportunities`];

    for (const page of portalPages) {
      const links = await findGrantLinksOnPage(page, grantName);
      for (const link of links.slice(0, 3)) {
        const health = await checkUrlHealth(link);
        if (health.status === "live") {
          return { found: true, newUrl: link, method: "funder_crawl" };
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  } catch { /* domain unreachable */ }

  return { found: false };
}

/**
 * Run recovery for a single grant in the database.
 * Updates the grant record if a working URL is found.
 */
export async function recoverGrantUrl(
  grantId: string,
  supabase: ReturnType<typeof import("./supabase").getSupabaseAdmin>
): Promise<{ recovered: boolean; newUrl?: string; method?: string }> {
  const { data: grant } = await supabase
    .from("Grant")
    .select("applicationUrl, name, funder, url_status")
    .eq("id", grantId)
    .maybeSingle();

  if (!grant?.applicationUrl || !grant.name) {
    return { recovered: false };
  }

  const status = (grant as { url_status?: UrlStatus }).url_status;
  if (status !== "dead" && status !== "expired") {
    return { recovered: false };
  }

  const result = await attemptUrlRecovery(grant.applicationUrl, grant.name, grant.funder ?? "");

  if (result.found && result.newUrl) {
    await supabase
      .from("Grant")
      .update({
        applicationUrl: result.newUrl,
        url_status: "live" as UrlStatus,
        url_checked_at: new Date().toISOString(),
      })
      .eq("id", grantId);

    console.info(`[url-recovery] Recovered grant ${grantId}: ${grant.applicationUrl} → ${result.newUrl} (${result.method})`);
    return { recovered: true, newUrl: result.newUrl, method: result.method };
  }

  return { recovered: false };
}
