/**
 * Crawl a URL (foundation/newsletter page), optionally classify with AI, then extract grants with AI.
 * Used by grant-source-crawler for type foundation/newsletter/crawl.
 * Respects per-domain throttle and robots.txt; supports change detection via lastContentHash.
 */

import type { GrantInput } from "@/lib/grants-ingest";
import { isGrantPage, extractGrantsFromPage } from "@/lib/grants-ai-extract";
import { createHash } from "crypto";
import { waitForDomainThrottle } from "@/lib/throttle-per-domain";
import { isAllowedByRobots } from "@/lib/robots-txt";

const FETCH_TIMEOUT_MS = 20_000;
const USER_AGENT = "Grants-Copilot/1.0 (grant aggregator; +https://grantspilot.co.uk)";

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fetch HTML from a URL. No JS rendering; use for static or server-rendered pages.
 * Throttles per domain and checks robots.txt before fetching.
 */
export async function fetchPageHtml(url: string): Promise<{ html: string; contentHash: string }> {
  await waitForDomainThrottle(url);
  const allowed = await isAllowedByRobots(url);
  if (!allowed) throw new Error(`robots.txt disallows: ${url}`);
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Crawl fetch ${res.status}: ${url}`);
  const html = await res.text();
  const contentHash = createHash("sha256").update(html).digest("hex").slice(0, 16);
  return { html, contentHash };
}

export interface FetchGrantsFromCrawlResult {
  grants: GrantInput[];
  contentHash: string;
}

/**
 * Fetch a page, optionally skip if not grant-related, then AI-extract grants.
 * Set skipClassifier true to always extract (e.g. when source is known to be grant-focused).
 * If lastContentHash is provided and equals the new page hash, returns empty grants (change detection).
 */
export async function fetchGrantsFromCrawl(
  pageUrl: string,
  sourceName: string,
  options?: { skipClassifier?: boolean; lastContentHash?: string | null }
): Promise<FetchGrantsFromCrawlResult> {
  const { html, contentHash } = await fetchPageHtml(pageUrl);
  if (options?.lastContentHash != null && options.lastContentHash === contentHash) {
    return { grants: [], contentHash };
  }
  const text = stripHtmlToText(html);
  if (!text || text.length < 200) return { grants: [], contentHash };

  if (!options?.skipClassifier) {
    const isGrant = await isGrantPage(html);
    if (!isGrant) return { grants: [], contentHash };
  }

  const grants = await extractGrantsFromPage(html, pageUrl);
  return {
    grants: grants.map((g) => ({
      ...g,
      funder: g.funder || sourceName,
    })),
    contentHash,
  };
}
