/**
 * Discovery inputs: sitemap and RSS link discovery to enqueue candidate URLs.
 * Optional: Google/Bing search when API keys are configured.
 * Throttles per domain before each sitemap/fetch.
 */

import { enqueueDiscoveryUrls } from "@/lib/grant-discovery-queue";
import { waitForDomainThrottle } from "@/lib/throttle-per-domain";

const MAX_URLS_PER_RUN = 80;
const SITEMAP_TIMEOUT_MS = 15_000;
const USER_AGENT = "Grants-Copilot/1.0 (grant discovery; +https://grantspilot.co.uk)";

/** Extract <loc> URLs from sitemap XML (or sitemap index). */
function extractLocUrls(xml: string): string[] {
  const urls: string[] = [];
  const re = /<loc>\s*([^<]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const u = m[1].trim();
    if (u && !urls.includes(u)) urls.push(u);
  }
  return urls;
}

/** Fetch sitemap (or sitemap index) and return page URLs matching path pattern. */
async function fetchSitemapUrls(
  sitemapUrl: string,
  pathPattern?: RegExp
): Promise<string[]> {
  await waitForDomainThrottle(sitemapUrl);
  const res = await fetch(sitemapUrl, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(SITEMAP_TIMEOUT_MS),
    next: { revalidate: 0 },
  });
  if (!res.ok) return [];
  const xml = await res.text();
  const all = extractLocUrls(xml);

  const isSitemapIndex = xml.includes("<sitemap") && all.some((u) => /sitemap/i.test(u));
  if (isSitemapIndex && all.length > 0) {
    const pageUrls: string[] = [];
    for (const subUrl of all.slice(0, 5)) {
      if (/sitemap/i.test(subUrl)) {
        const sub = await fetchSitemapUrls(subUrl, pathPattern).catch(() => []);
        pageUrls.push(...sub);
      } else if (!pathPattern || pathPattern.test(subUrl)) {
        pageUrls.push(subUrl);
      }
    }
    return pageUrls;
  }

  if (pathPattern) return all.filter((u) => pathPattern.test(u));
  return all;
}

/** Known grant-related path patterns for sitemaps. */
const GRANT_PATH_PATTERN = /\/grant|\/funding|\/opportunit|\/programme|\/apply|\/grants\//i;

/** Domains and their sitemap URLs + optional path filter. */
const SITEMAP_SOURCES: { url: string; source: string; pattern?: RegExp }[] = [
  { url: "https://www.grants.gov/sitemap.xml", source: "sitemap-grants-gov", pattern: GRANT_PATH_PATTERN },
  { url: "https://www.find-government-grants.service.gov.uk/sitemap.xml", source: "sitemap-uk-fag", pattern: /\/grants\//i },
  { url: "https://ec.europa.eu/info/funding-tenders/sitemap.xml", source: "sitemap-eu", pattern: GRANT_PATH_PATTERN },
  { url: "https://www.ukri.org/sitemap.xml", source: "sitemap-ukri", pattern: GRANT_PATH_PATTERN },
  { url: "https://www.grants.gov.au/sitemap.xml", source: "sitemap-grantconnect", pattern: GRANT_PATH_PATTERN },
  { url: "https://open.canada.ca/sitemap.xml", source: "sitemap-canada", pattern: /\/grants|\/grant\//i },
  { url: "https://grants.nih.gov/sitemap.xml", source: "sitemap-nih", pattern: GRANT_PATH_PATTERN },
  { url: "https://www.nsf.gov/sitemap.xml", source: "sitemap-nsf", pattern: GRANT_PATH_PATTERN },
];

/**
 * Discover URLs from configured sitemaps and enqueue them. Returns count of newly enqueued.
 */
export async function discoverFromSitemaps(): Promise<number> {
  let total = 0;
  for (const { url, source, pattern } of SITEMAP_SOURCES) {
    try {
      const urls = await fetchSitemapUrls(url, pattern);
      const toEnqueue = urls.slice(0, MAX_URLS_PER_RUN - total);
      const n = await enqueueDiscoveryUrls(toEnqueue, source);
      total += n;
      if (total >= MAX_URLS_PER_RUN) break;
    } catch (e) {
      console.warn("[grant-discovery] sitemap failed:", url, e);
    }
  }
  return total;
}

/**
 * Discover URLs from an RSS feed (item links). Used by discovery job to enqueue from known feeds.
 */
export async function discoverFromRssFeed(
  feedUrl: string,
  sourceLabel: string
): Promise<number> {
  await waitForDomainThrottle(feedUrl);
  const Parser = (await import("rss-parser")).default;
  const parser = new Parser({ timeout: 10_000 });
  try {
    const feed = await parser.parseURL(feedUrl);
    const urls = (feed.items ?? [])
      .map((i) => i.link?.trim())
      .filter((u): u is string => !!u && u.startsWith("http"));
    return enqueueDiscoveryUrls(urls.slice(0, 30), sourceLabel);
  } catch (e) {
    console.warn("[grant-discovery] RSS discovery failed:", feedUrl, e);
    return 0;
  }
}

/** Search queries for grant discovery (used when BING_SEARCH_API_KEY or Google CSE is set). */
const DISCOVERY_SEARCH_QUERIES = [
  "grant opportunity site:.gov",
  "funding call open site:.gov.uk",
  "innovation grant application site:.gov",
  "research grant call site:.eu",
  "startup grant programme",
];

const SEARCH_MAX_URLS = 50;

/**
 * Discover URLs via Bing Web Search API. Set BING_SEARCH_API_KEY in env.
 */
async function discoverFromBing(): Promise<number> {
  const key = process.env.BING_SEARCH_API_KEY?.trim();
  if (!key) return 0;
  const urls: string[] = [];
  try {
    for (const query of DISCOVERY_SEARCH_QUERIES.slice(0, 3)) {
      await waitForDomainThrottle("https://api.bing.microsoft.com");
      const res = await fetch(
        `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=15`,
        {
          headers: { "Ocp-Apim-Subscription-Key": key },
          signal: AbortSignal.timeout(10_000),
          next: { revalidate: 0 },
        }
      );
      if (!res.ok) continue;
      const json = (await res.json()) as { webPages?: { value?: { url?: string }[] } };
      const pageUrls = (json.webPages?.value ?? []).map((p) => p.url).filter((u): u is string => !!u);
      urls.push(...pageUrls);
      if (urls.length >= SEARCH_MAX_URLS) break;
    }
    return enqueueDiscoveryUrls([...new Set(urls)].slice(0, SEARCH_MAX_URLS), "bing-search");
  } catch (e) {
    console.warn("[grant-discovery] Bing search failed:", e);
    return 0;
  }
}

/**
 * Discover URLs via Google Custom Search JSON API. Set GOOGLE_CSE_API_KEY and GOOGLE_CSE_ID in env.
 */
async function discoverFromGoogle(): Promise<number> {
  const apiKey = process.env.GOOGLE_CSE_API_KEY?.trim();
  const cseId = process.env.GOOGLE_CSE_ID?.trim();
  if (!apiKey || !cseId) return 0;
  const urls: string[] = [];
  try {
    for (const query of DISCOVERY_SEARCH_QUERIES.slice(0, 3)) {
      await waitForDomainThrottle("https://www.googleapis.com");
      const res = await fetch(
        `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(query)}&num=15`,
        { signal: AbortSignal.timeout(10_000), next: { revalidate: 0 } }
      );
      if (!res.ok) continue;
      const json = (await res.json()) as { items?: { link?: string }[] };
      const pageUrls = (json.items ?? []).map((p) => p.link).filter((u): u is string => !!u);
      urls.push(...pageUrls);
      if (urls.length >= SEARCH_MAX_URLS) break;
    }
    return enqueueDiscoveryUrls([...new Set(urls)].slice(0, SEARCH_MAX_URLS), "google-search");
  } catch (e) {
    console.warn("[grant-discovery] Google search failed:", e);
    return 0;
  }
}

/**
 * Run all discovery inputs (sitemaps, RSS, optional search) and enqueue up to MAX_URLS_PER_RUN.
 */
export async function runDiscoveryEnqueue(): Promise<{ enqueued: number }> {
  let enqueued = await discoverFromSitemaps();
  if (enqueued < MAX_URLS_PER_RUN) {
    const fromRss = await discoverFromRssFeed(
      "https://www.grants.gov/rss/GG_NewOppByAgency.xml",
      "rss-grants-gov"
    );
    enqueued += fromRss;
  }
  if (enqueued < MAX_URLS_PER_RUN) {
    const fromBing = await discoverFromBing();
    enqueued += fromBing;
  }
  if (enqueued < MAX_URLS_PER_RUN) {
    const fromGoogle = await discoverFromGoogle();
    enqueued += fromGoogle;
  }
  return { enqueued };
}
