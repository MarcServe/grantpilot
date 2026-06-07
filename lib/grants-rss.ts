/**
 * Generic RSS/Atom grant ingestion. Maps feed items to GrantInput for upsert (hash dedup when no guid).
 */

import Parser from "rss-parser";
import type { GrantInput } from "@/lib/grants-ingest";
import { looksLikeGenericOrListUrl } from "@/lib/grant-url-validation";
import { isPastGrantDeadline } from "@/lib/grant-freshness";

const parser = new Parser({ timeout: 15_000 });

function parseDate(s: string | undefined, dateOrder: "mdy" | "dmy" = "dmy"): string | null {
  if (!s?.trim()) return null;
  const trimmed = s.trim();
  const slash = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    const year = Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]);
    const month = dateOrder === "mdy" ? first : second;
    const day = dateOrder === "mdy" ? second : first;
    const d = new Date(Date.UTC(year, month - 1, day));
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function dateOrderForFeed(feedUrl: string): "mdy" | "dmy" {
  return /grants\.gov|nih\.gov|nsf\.gov|\.gov\//i.test(feedUrl) ? "mdy" : "dmy";
}

function inferFunderLocations(feedUrl: string, funder: string): string[] {
  const text = `${feedUrl} ${funder}`.toLowerCase();
  if (/grants\.gov|nih\.gov|nsf\.gov|usa\.gov|\.gov\//i.test(text)) return ["US"];
  if (/grants\.gov\.au|business\.gov\.au|australia|grantconnect/i.test(text)) return ["AU"];
  if (/canada|\.gc\.ca|open\.canada\.ca/i.test(text)) return ["CA"];
  if (/europa\.eu|european|horizon|eic/i.test(text)) return ["EU"];
  if (/gov\.uk|ukri|united kingdom|find-government-grants|innovate uk/i.test(text)) return ["UK"];
  return [];
}

function extractDeadlineFromText(text: string, dateOrder: "mdy" | "dmy"): string | null {
  const clean = stripHtml(text);
  const datePattern =
    "(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|\\d{1,2}\\s+[A-Za-z]+\\s+\\d{4}|[A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4})";
  const deadlinePattern = new RegExp(
    `(?:deadline|closing\\s+date|applications?\\s+close|apply\\s+by|due\\s+date|submission\\s+deadline|close\\s+date|closes)[:\\s-]*(?:on\\s+|by\\s+)?${datePattern}`,
    "i"
  );
  const labelled = clean.match(deadlinePattern);
  const raw = labelled?.[1] ?? null;
  if (!raw) return null;

  const parsed = parseDate(raw, dateOrder);
  if (!parsed || isPastGrantDeadline(parsed)) return null;
  return parsed;
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
  const dateOrder = dateOrderForFeed(feedUrl);
  const funderLocations = inferFunderLocations(feedUrl, funder);
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
    const deadline = extractDeadlineFromText(
      [title, item.content, item.contentSnippet, (item as { description?: string }).description]
        .filter((value): value is string => typeof value === "string")
        .join(" "),
      dateOrder
    );
    const externalId =
      typeof (item as { guid?: string }).guid === "string"
        ? `rss-${(item as { guid: string }).guid}`
        : undefined;

    out.push({
      externalId,
      name: title,
      funder,
      amount: null,
      deadline,
      applicationUrl: link,
      eligibility: eligibility.slice(0, 5000),
      sectors: [],
      regions: funderLocations,
      funderLocations,
      source: "default",
    });
  }

  return out;
}
