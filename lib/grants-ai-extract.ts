/**
 * AI-powered extraction of grant opportunities from unstructured HTML or page text.
 * Uses Claude to map content to a fixed schema; caller upserts with hash dedup.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { GrantInput } from "@/lib/grants-ingest";

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 8192;
const MAX_PAGE_CHARS = 80_000;

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_PAGE_CHARS);
}

/**
 * Optional classifier: does this page announce or list grant/funding opportunities?
 * Prefer yes if the text mentions deadline/closing date or funding amounts (£, €, $).
 */
export async function isGrantPage(htmlOrText: string): Promise<boolean> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return true;

  const text = htmlOrText.length > 20_000 ? htmlOrText.slice(0, 20_000) + "…" : htmlOrText;
  const clean = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000);

  const hasDeadlineSignal = /\b(deadline|closing\s+date|applications\s+close|call\s+opens|submission\s+deadline)\b/i.test(clean);
  const hasCurrencySignal = /[£€$]|\bfunding\s+up\s+to\b|\bgrant\s+value\b/i.test(clean);

  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 64,
    messages: [
      {
        role: "user",
        content: `Is this web page announcing or listing a grant, funding programme, or call for proposals (e.g. funding opportunity, innovation competition, award)? Answer only: yes or no.
Prefer yes if the text mentions an application deadline, closing date, or funding amount (£, €, $). Exclude general blog posts or news that only mention grants in passing.

${clean}`,
      },
    ],
  });
  const out =
    response.content[0].type === "text" ? response.content[0].text.trim().toLowerCase() : "";
  if (out.startsWith("yes")) return true;
  if (hasDeadlineSignal && hasCurrencySignal) return true;
  return false;
}

const EXTRACT_SYSTEM = `You extract grant and funding opportunities from web page content. Treat the page as a grant opportunity if it clearly contains at least two of: funding amount (or range), eligibility criteria, application deadline, or "how to apply". Return a JSON array of objects. Each object must have:
- grant_title (string): name of the grant or programme
- funder (string): organisation offering the funding
- funding_amount (number or null): maximum amount if stated
- deadline (string or null): application deadline in ISO date YYYY-MM-DD if found
- country (string or null): country or region of the funder
- eligibility (string): short eligibility summary
- sector (string or null): sector or theme
- application_link (string): URL to apply or to the opportunity page; use the page URL if no specific link is given

If the page lists multiple opportunities, include each as a separate object. If you find none, return []. Return only the JSON array, no markdown or explanation.`;

/**
 * Extract grant opportunities from HTML or plain text using Claude. Uses pageUrl as fallback for application_link.
 */
export async function extractGrantsFromPage(
  htmlOrText: string,
  pageUrl: string
): Promise<GrantInput[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return [];

  const isHtml = /<[a-z][\s\S]*>/i.test(htmlOrText);
  const text = isHtml ? stripHtmlToText(htmlOrText) : htmlOrText.slice(0, MAX_PAGE_CHARS);
  if (!text.trim()) return [];

  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: EXTRACT_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Page URL: ${pageUrl}\n\nExtract all grant or funding opportunities from this content:\n\n${text}`,
      },
    ],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "";
  let arr: unknown[] = [];
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned) as unknown;
    arr = Array.isArray(parsed) ? parsed : [];
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        arr = JSON.parse(match[0]) as unknown[];
      } catch {
        /* ignore */
      }
    }
  }

  const out: GrantInput[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.grant_title === "string" ? o.grant_title.trim() : typeof o.name === "string" ? (o.name as string).trim() : "";
    const funder = typeof o.funder === "string" ? (o.funder as string).trim() : "";
    const applicationUrl =
      typeof o.application_link === "string"
        ? (o.application_link as string).trim()
        : typeof o.applicationUrl === "string"
          ? (o.applicationUrl as string).trim()
          : pageUrl;
    if (!name || !funder) continue;

    const amount =
      typeof o.funding_amount === "number"
        ? o.funding_amount
        : typeof o.amount === "number"
          ? o.amount
          : null;
    const deadline =
      typeof o.deadline === "string" ? (o.deadline as string).trim() : null;
    const eligibility =
      typeof o.eligibility === "string"
        ? (o.eligibility as string).trim()
        : "See application page.";
    const sector = typeof o.sector === "string" ? (o.sector as string).trim() : null;
    const country = typeof o.country === "string" ? (o.country as string).trim() : null;

    out.push({
      name,
      funder,
      amount: amount != null && !Number.isNaN(amount) ? amount : null,
      deadline: deadline || null,
      applicationUrl: applicationUrl || pageUrl,
      eligibility: eligibility.slice(0, 5000),
      sectors: sector ? [sector] : [],
      regions: country ? [country] : [],
      funderLocations: country ? [country] : [],
      source: "default",
    });
  }
  return out;
}
