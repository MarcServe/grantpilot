/**
 * URL health checking pipeline.
 *
 * Layer 1 (FREE):  HEAD/GET request — catches dead domains, 404s, SSL errors, timeouts
 * Layer 2 (FREE):  Soft-404 keyword detection — catches pages that return 200 but say "not found"
 * Layer 3 (FREE):  Expired programme detection — catches "applications closed" / "scheme ended"
 *
 * Gemini vision (Layer 4) runs separately in the scout worker for deeper page analysis.
 */

import { getSupabaseAdmin } from "@/lib/supabase";

export type UrlStatus = "live" | "dead" | "expired" | "unknown";

export interface HealthCheckResult {
  status: UrlStatus;
  httpStatus: number;
  reason: string;
}

const TIMEOUT_MS = 10_000;

const DEAD_PAGE_PATTERNS = [
  /page\s*not\s*found/i,
  /404\s*(error|not\s*found)?/i,
  /this\s*page\s*(doesn.t|does\s*not)\s*exist/i,
  /no\s*longer\s*available/i,
  /has\s*been\s*removed/i,
  /url\s*(was\s*)?not\s*found/i,
  /the\s*requested\s*resource\s*was\s*not\s*found/i,
  /nothing\s*found/i,
  /oops!?\s*we\s*can.?t\s*find/i,
  /error\s*404/i,
];

const EXPIRED_PATTERNS = [
  /applications?\s*(are|is|have|has)\s*(now\s*)?(been\s*)?closed/i,
  /this\s*(scheme|programme|program|grant|fund|competition)\s*(has|is)\s*(now\s*)?(been\s*)?(closed|ended|expired|finished|concluded)/i,
  /no\s*longer\s*(accepting|open|available)/i,
  /deadline\s*(has\s*)?passed/i,
  /this\s*(call|round)\s*(has\s*)?closed/i,
  /applications?\s*(closed|ended)\s*(on|in)\s/i,
  /funding\s*(has\s*)?ended/i,
  /this\s*(opportunity|competition)\s*(is|has)\s*(now\s*)?closed/i,
  /registration\s*(is\s*)?(now\s*)?closed/i,
  /we\s*are\s*no\s*longer\s*accepting/i,
];

/**
 * Quick HTTP check — no browser, no AI. Catches obvious dead links.
 */
export async function checkUrlHealth(url: string): Promise<HealthCheckResult> {
  if (!url?.trim()) {
    return { status: "dead", httpStatus: 0, reason: "Empty URL" };
  }

  try {
    new URL(url);
  } catch {
    return { status: "dead", httpStatus: 0, reason: "Invalid URL format" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const headRes = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GrantPilotBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    clearTimeout(timeout);

    if (headRes.status === 404 || headRes.status === 410 || headRes.status === 403) {
      return { status: "dead", httpStatus: headRes.status, reason: `HTTP ${headRes.status}` };
    }
    if (headRes.status >= 500) {
      return { status: "dead", httpStatus: headRes.status, reason: `Server error ${headRes.status}` };
    }

    if (!headRes.ok && headRes.status !== 405) {
      return { status: "dead", httpStatus: headRes.status, reason: `HTTP ${headRes.status}` };
    }

    const getController = new AbortController();
    const getTimeout = setTimeout(() => getController.abort(), TIMEOUT_MS);
    try {
      const getRes = await fetch(url, {
        method: "GET",
        signal: getController.signal,
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; GrantPilotBot/1.0)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      clearTimeout(getTimeout);

      const html = await getRes.text();
      const bodyText = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 5000);

      if (DEAD_PAGE_PATTERNS.some((p) => p.test(bodyText))) {
        return { status: "dead", httpStatus: getRes.status, reason: "Soft 404 detected in page content" };
      }

      if (EXPIRED_PATTERNS.some((p) => p.test(bodyText))) {
        return { status: "expired", httpStatus: getRes.status, reason: "Programme appears closed/expired" };
      }

      return { status: "live", httpStatus: getRes.status, reason: "OK" };
    } catch {
      clearTimeout(getTimeout);
      return { status: "live", httpStatus: headRes.status, reason: "HEAD OK, GET timed out (likely JS-heavy)" };
    }
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort") || msg.includes("timeout")) {
      return { status: "dead", httpStatus: 0, reason: "Connection timed out" };
    }
    if (msg.includes("CERT") || msg.includes("SSL") || msg.includes("certificate")) {
      return { status: "dead", httpStatus: 0, reason: "SSL/certificate error" };
    }
    return { status: "dead", httpStatus: 0, reason: `Connection failed: ${msg.slice(0, 100)}` };
  }
}

/**
 * Check and update a grant's URL status in the database.
 */
export async function checkAndUpdateGrantUrl(grantId: string): Promise<HealthCheckResult> {
  const supabase = getSupabaseAdmin();
  const { data: grant } = await supabase
    .from("Grant")
    .select("applicationUrl")
    .eq("id", grantId)
    .maybeSingle();

  if (!grant?.applicationUrl) {
    return { status: "dead", httpStatus: 0, reason: "No URL" };
  }

  const result = await checkUrlHealth(grant.applicationUrl);

  await supabase
    .from("Grant")
    .update({
      url_status: result.status,
      url_checked_at: new Date().toISOString(),
    })
    .eq("id", grantId);

  return result;
}

/**
 * Batch check grants that haven't been verified recently.
 * Returns count of checked grants.
 */
export async function sweepGrantUrls(maxAge: number = 7, batchSize: number = 50): Promise<{
  checked: number;
  live: number;
  dead: number;
  expired: number;
}> {
  const supabase = getSupabaseAdmin();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAge);

  const { data: grants } = await supabase
    .from("Grant")
    .select("id, applicationUrl")
    .or(`url_checked_at.is.null,url_checked_at.lt.${cutoff.toISOString()}`)
    .limit(batchSize);

  const stats = { checked: 0, live: 0, dead: 0, expired: 0 };
  if (!grants?.length) return stats;

  for (const g of grants) {
    if (!g.applicationUrl) continue;
    const result = await checkUrlHealth(g.applicationUrl);
    await supabase
      .from("Grant")
      .update({
        url_status: result.status,
        url_checked_at: new Date().toISOString(),
      })
      .eq("id", g.id);

    stats.checked++;
    if (result.status === "live") stats.live++;
    else if (result.status === "expired") stats.expired++;
    else if (result.status === "dead") stats.dead++;

    await new Promise((r) => setTimeout(r, 500));
  }

  return stats;
}
