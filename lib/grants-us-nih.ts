/**
 * US NIH grant discovery via NIH Guide RSS feed (funding opportunities).
 * No API key required — public RSS.
 */

import type { GrantInput } from "@/lib/grants-ingest";
import { fetchGrantsFromRssFeed } from "@/lib/grants-rss";

const NIH_FUNDING_RSS = "https://grants.nih.gov/grants/guide/newsfeed/fundingopps.xml";

/**
 * Fetch NIH funding opportunities from the NIH Guide RSS.
 */
export async function fetchGrantsFromNIH(): Promise<GrantInput[]> {
  try {
    const grants = await fetchGrantsFromRssFeed(NIH_FUNDING_RSS, "National Institutes of Health");
    return grants.map((g) => ({
      ...g,
      funderLocations: g.funderLocations?.length ? g.funderLocations : ["US"],
      regions: g.regions?.length ? g.regions : ["United States"],
    }));
  } catch (err) {
    console.error("[grants-us-nih] NIH RSS failed:", err);
    return [];
  }
}
