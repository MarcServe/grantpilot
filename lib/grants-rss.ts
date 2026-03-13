/**
 * Generic RSS/Atom grant ingestion. Maps feed items to GrantInput for upsert (hash dedup when no guid).
 */

import Parser from "rss-parser";
import type { GrantInput } from "@/lib/grants-ingest";
import { looksLikeGenericOrListUrl } from "@/lib/grant-url-validation";

const parser = new Parser({ timeout: 15_000 });

function parseDate(s: string | undefined): string | null {
  if (!s?.trim()) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Fetch an RSS/Atom feed and return grant-like inputs. Use feed title or defaultFunder as funder.
 */
export async function fetchGrantsFromRssFeed(
  feedUrl: string,
  defaultFunder?: string
): Promise<GrantInput[]> {
  const feed = await parser.parseURL(feedUrl);
  const funder = (defaultFunder || feed.title?.trim() || "Unknown").trim();
  const out: GrantInput[] = [];

  for (const item of feed.items ?? []) {
    const title = item.title?.trim();
    const link = item.link?.trim();
    if (!title || !link) continue;
    if (looksLikeGenericOrListUrl(link)) continue;

    const eligibility =
      item.content?.trim() ||
      item.contentSnippet?.trim() ||
      (item as { description?: string }).description?.trim() ||
      "See application page.";
    const externalId =
      typeof (item as { guid?: string }).guid === "string"
        ? `rss-${(item as { guid: string }).guid}`
        : undefined;

    out.push({
      externalId,
      name: title,
      funder,
      amount: null,
      deadline: parseDate(item.pubDate ?? (item as { isoDate?: string }).isoDate) ?? null,
      applicationUrl: link,
      eligibility: eligibility.slice(0, 5000),
      sectors: [],
      regions: [],
      funderLocations: [],
      source: "default",
    });
  }

  return out;
}
