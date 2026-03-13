/**
 * Australia grant discovery via GrantConnect (grants.gov.au) RSS feed.
 * No API key required — public RSS.
 */

import type { GrantInput } from "@/lib/grants-ingest";
import { fetchGrantsFromRssFeed } from "@/lib/grants-rss";

const GRANTCONNECT_RSS = "https://www.grants.gov.au/public_data/rss/rss.xml";

/**
 * Fetch current grant opportunities from Australian Government GrantConnect RSS.
 */
export async function fetchGrantsFromAU(): Promise<GrantInput[]> {
  try {
    const grants = await fetchGrantsFromRssFeed(GRANTCONNECT_RSS, "Australian Government");
    return grants.map((g) => ({
      ...g,
      funderLocations: ["AU"],
      regions: g.regions?.length ? g.regions : ["Australia"],
    }));
  } catch (err) {
    console.error("[grants-au] GrantConnect RSS failed:", err);
    return [];
  }
}
