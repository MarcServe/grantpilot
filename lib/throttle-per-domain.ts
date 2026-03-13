/**
 * Per-domain request throttling: wait before hitting the same host again.
 * Used by grant-source-crawler and discovery processor to avoid hammering portals.
 */

const DEFAULT_MIN_INTERVAL_MS = 3_000; // 3 seconds between requests to same domain

const lastRequestByDomain = new Map<string, number>();

/**
 * Extract host (domain) from a URL for throttling key.
 */
export function getDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase();
  } catch {
    return url;
  }
}

/**
 * Wait if we've requested this domain recently so we don't exceed minIntervalMs between requests.
 * Call before each fetch to the domain.
 */
export async function waitForDomainThrottle(
  urlOrDomain: string,
  minIntervalMs: number = DEFAULT_MIN_INTERVAL_MS
): Promise<void> {
  const domain = urlOrDomain.includes("/") ? getDomain(urlOrDomain) : urlOrDomain.toLowerCase();
  const now = Date.now();
  const last = lastRequestByDomain.get(domain);
  if (last != null) {
    const elapsed = now - last;
    if (elapsed < minIntervalMs) {
      await new Promise((r) => setTimeout(r, minIntervalMs - elapsed));
    }
  }
  lastRequestByDomain.set(domain, Date.now());
}

/**
 * Record that we're about to request this domain (call after waitForDomainThrottle if you want to reserve the slot).
 * Normally waitForDomainThrottle updates the timestamp after the wait; this is for explicit recording.
 */
export function recordDomainRequest(urlOrDomain: string): void {
  const domain = urlOrDomain.includes("/") ? getDomain(urlOrDomain) : urlOrDomain.toLowerCase();
  lastRequestByDomain.set(domain, Date.now());
}
