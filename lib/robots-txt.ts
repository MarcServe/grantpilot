/**
 * Simple robots.txt check: fetch and parse Disallow rules for our User-agent.
 * Used before crawling to respect site politeness.
 */

const USER_AGENT = "Grants-Copilot/1.0 (grant aggregator; +https://grantspilot.co.uk)";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour per host
const FETCH_TIMEOUT_MS = 8_000;

interface CacheEntry {
  rules: string[];
  at: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Fetch robots.txt for the URL's origin and parse Disallow lines for User-agent: * or our UA.
 * Returns list of path prefixes that are disallowed (e.g. ["/api/", "/admin"]).
 */
async function getDisallowRules(url: string): Promise<string[]> {
  try {
    const u = new URL(url);
    const origin = `${u.protocol}//${u.host}`;
    const robotsUrl = `${origin}/robots.txt`;
    const key = u.hostname.toLowerCase();

    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.rules;

    const res = await fetch(robotsUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      cache.set(key, { rules: [], at: Date.now() });
      return [];
    }
    const text = await res.text();
    const rules = parseRobotsTxt(text);
    cache.set(key, { rules, at: Date.now() });
    return rules;
  } catch {
    return [];
  }
}

/**
 * Simple parser: find User-agent: * or User-agent: <our UA> block, collect Disallow: lines.
 */
function parseRobotsTxt(txt: string): string[] {
  const lines = txt.split(/\r?\n/).map((l) => l.trim());
  const rules: string[] = [];
  let inRelevantBlock = false;

  for (const line of lines) {
    const uaMatch = line.match(/^user-agent:\s*(.*)$/i);
    if (uaMatch) {
      const ua = (uaMatch[1] ?? "").trim().toLowerCase();
      inRelevantBlock = ua === "*" || USER_AGENT.toLowerCase().includes(ua) || ua.includes("grant");
      continue;
    }
    if (inRelevantBlock) {
      const disallow = line.match(/^disallow:\s*(.+)$/i);
      if (disallow) {
        const path = disallow[1].trim();
        if (path) rules.push(path);
      }
      if (/^allow:\s+/i.test(line) || /^user-agent:/i.test(line)) {
        // still in block
      }
      if (/^sitemap:/i.test(line) || (line === "" && rules.length > 0)) {
        // optional: end of block
      }
    }
  }
  return rules;
}

/**
 * Return true if the URL is allowed by robots.txt (no matching Disallow), false if disallowed.
 * If we can't fetch robots.txt or parse it, we allow the request (fail open).
 */
export async function isAllowedByRobots(url: string): Promise<boolean> {
  const rules = await getDisallowRules(url);
  if (rules.length === 0) return true;
  try {
    const u = new URL(url);
    const path = u.pathname || "/";
    for (const rule of rules) {
      const prefix = rule.startsWith("/") ? rule : `/${rule}`;
      if (path === prefix || path.startsWith(prefix + "/") || path.startsWith(prefix)) return false;
    }
    return true;
  } catch {
    return true;
  }
}
