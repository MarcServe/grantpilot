/**
 * AI-powered extraction of grant opportunities from unstructured HTML or page text.
 * Uses OpenAI to map content to a fixed schema; caller upserts with hash dedup.
 */

import type { GrantInput } from "@/lib/grants-ingest";
import { cleanJsonResponse, completeJson, completeText } from "@/lib/openai-client";
import OpenAI from "openai";

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
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return true;

  const text = htmlOrText.length > 20_000 ? htmlOrText.slice(0, 20_000) + "…" : htmlOrText;
  const clean = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000);

  const hasDeadlineSignal = /\b(deadline|closing\s+date|applications\s+close|call\s+opens|submission\s+deadline)\b/i.test(clean);
  const hasCurrencySignal = /[£€$]|\bfunding\s+up\s+to\b|\bgrant\s+value\b/i.test(clean);

  const out = await completeText(
    `Is this web page announcing or listing a grant, funding programme, or call for proposals (e.g. funding opportunity, innovation competition, award)? Answer only: yes or no.
Prefer yes if the text mentions an application deadline, closing date, or funding amount (£, €, $). Exclude general blog posts or news that only mention grants in passing.

${clean}`,
    64
  );
  if (out.trim().toLowerCase().startsWith("yes")) return true;
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
- detail_link (string): official grant/detail page URL for this specific grant; use the page URL if no specific page link is given
- direct_application_link (string or null): direct form or official portal start URL only when clearly present; otherwise null

If the page lists multiple opportunities, include each as a separate object. If you find none, return []. Return only the JSON array, no markdown or explanation.`;

/**
 * Extract grant opportunities from HTML or plain text using OpenAI. Uses pageUrl as fallback for application_link.
 */
export async function extractGrantsFromPage(
  htmlOrText: string,
  pageUrl: string
): Promise<GrantInput[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return [];

  const isHtml = /<[a-z][\s\S]*>/i.test(htmlOrText);
  const text = isHtml ? stripHtmlToText(htmlOrText) : htmlOrText.slice(0, MAX_PAGE_CHARS);
  if (!text.trim()) return [];

  const raw = await completeJson(
    `${EXTRACT_SYSTEM}

Return valid JSON with this shape:
{ "grants": [] }

Page URL: ${pageUrl}

Extract all grant or funding opportunities from this content:

${text}`,
    MAX_TOKENS
  );

  let arr: unknown[] = [];
  try {
    const cleaned = cleanJsonResponse(raw);
    const parsed = JSON.parse(cleaned) as unknown;
    arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { grants?: unknown }).grants)
        ? (parsed as { grants: unknown[] }).grants
        : [];
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
    const legacyApplicationUrl =
      typeof o.application_link === "string"
        ? (o.application_link as string).trim()
        : typeof o.applicationUrl === "string"
          ? (o.applicationUrl as string).trim()
          : "";
    const detailUrl =
      typeof o.detail_link === "string" && o.detail_link.trim()
        ? o.detail_link.trim()
        : legacyApplicationUrl || pageUrl;
    const directApplicationUrl =
      typeof o.direct_application_link === "string" && o.direct_application_link.trim()
        ? o.direct_application_link.trim()
        : null;
    const applicationUrl = directApplicationUrl || detailUrl;
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
      applicationUrl,
      detailUrl,
      directApplicationUrl,
      eligibility: eligibility.slice(0, 5000),
      sectors: sector ? [sector] : [],
      regions: country ? [country] : [],
      funderLocations: country ? [country] : [],
      source: "default",
    });
  }
  return out;
}

/**
 * Optional Perplexity fallback for source-page enrichment.
 * Use only after the primary extractor finds no grants; trusted eligibility scoring still runs separately.
 */
export async function extractGrantsFromPageWithPerplexity(
  htmlOrText: string,
  pageUrl: string
): Promise<GrantInput[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY?.trim();
  if (!apiKey) return [];

  const isHtml = /<[a-z][\s\S]*>/i.test(htmlOrText);
  const text = (isHtml ? stripHtmlToText(htmlOrText) : htmlOrText).slice(0, 20_000);
  if (!text.trim()) return [];

  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.perplexity.ai",
  });

  const response = await client.chat.completions.create({
    model: "sonar",
    temperature: 0.1,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Use the source URL and page content below to extract current, real grant or funding opportunities only.

Rules:
- Prefer official UK, EU, or global programmes open to UK applicants.
- Do not include expired, closed, archived, historical, scholarship-only, or login-only pages as actionable grants.
- Do not invent deadlines, amounts, eligibility rules, or URLs.
- detail_link must be the official page for this exact grant/opportunity.
- direct_application_link must be a direct application form or official portal start URL only if the page exposes one. Use null if not visible.
- application_link may be included for backward compatibility, but set it to direct_application_link when present; otherwise set it to detail_link.
- Do not invent direct_application_link. Do not use generic landing pages such as council business support hubs.
- If no current grants are present, return {"grants":[]}.

Return JSON only with this shape:
{
  "grants": [
    {
      "grant_title": "Grant name",
      "funder": "Funder",
      "funding_amount": 0,
      "deadline": "YYYY-MM-DD or null",
      "country": "UK/EU/Global or null",
      "eligibility": "Short eligibility summary",
      "sector": "Sector or null",
      "detail_link": "https://...",
      "direct_application_link": "https://... or null",
      "application_link": "https://..."
    }
  ]
}

Source URL: ${pageUrl}

Page content:
${text}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw || typeof raw !== "string") return [];

  let arr: unknown[] = [];
  try {
    const cleaned = cleanJsonResponse(raw);
    const parsed = JSON.parse(cleaned) as unknown;
    arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { grants?: unknown }).grants)
        ? (parsed as { grants: unknown[] }).grants
        : [];
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      arr = JSON.parse(match[0]) as unknown[];
    } catch {
      return [];
    }
  }

  return arr
    .map((item): GrantInput | null => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const name = typeof o.grant_title === "string" ? o.grant_title.trim() : "";
      const funder = typeof o.funder === "string" ? o.funder.trim() : "";
      const legacyApplicationUrl = typeof o.application_link === "string" ? o.application_link.trim() : "";
      const detailUrl = typeof o.detail_link === "string" && o.detail_link.trim()
        ? o.detail_link.trim()
        : legacyApplicationUrl || pageUrl;
      const directApplicationUrl = typeof o.direct_application_link === "string" && o.direct_application_link.trim()
        ? o.direct_application_link.trim()
        : null;
      const applicationUrl = directApplicationUrl || detailUrl;
      if (!name || !funder || !applicationUrl) return null;

      const amount = typeof o.funding_amount === "number" && !Number.isNaN(o.funding_amount)
        ? o.funding_amount
        : null;
      const country = typeof o.country === "string" ? o.country.trim() : "";
      const sector = typeof o.sector === "string" ? o.sector.trim() : "";
      const eligibility = typeof o.eligibility === "string" && o.eligibility.trim()
        ? o.eligibility.trim()
        : "See application page.";
      const deadline = typeof o.deadline === "string" && o.deadline.trim().toLowerCase() !== "null"
        ? o.deadline.trim()
        : null;

      return {
        name,
        funder,
        amount,
        deadline,
        applicationUrl,
        detailUrl,
        directApplicationUrl,
        eligibility: eligibility.slice(0, 5000),
        sectors: sector ? [sector] : [],
        regions: country ? [country] : [],
        funderLocations: country ? [country] : [],
        source: "perplexity",
      };
    })
    .filter((grant): grant is GrantInput => grant != null);
}
