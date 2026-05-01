import { completeText } from "@/lib/openai-client";

const MAX_HTML_CHARS = 40_000;
const MAX_INTELLIGENCE_CHARS = 5_000;

async function fetchPageText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; GrantPilotBot/1.0; +https://grantpilot.co.uk)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    return extractWebsiteSignals(html, url).slice(0, MAX_HTML_CHARS);
  } finally {
    clearTimeout(timeout);
  }
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMetaContent(html: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return null;
}

function extractWebsiteSignals(html: string, url: string): string {
  const signals: string[] = [`Website URL: ${url}`];
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title) signals.push(`Title: ${decodeHtml(title)}`);

  for (const [label, key] of [
    ["Description", "description"],
    ["Open Graph title", "og:title"],
    ["Open Graph description", "og:description"],
    ["Twitter description", "twitter:description"],
  ] as const) {
    const value = extractMetaContent(html, key);
    if (value) signals.push(`${label}: ${value}`);
  }

  const jsonLdBlocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => decodeHtml(match[1] ?? ""))
    .filter(Boolean)
    .slice(0, 3);
  if (jsonLdBlocks.length > 0) {
    signals.push(`Structured data: ${jsonLdBlocks.join(" ")}`);
  }

  const bodyText = stripHtml(html);
  if (bodyText) signals.push(`Page text: ${bodyText}`);
  return signals.join("\n\n");
}

function stripHtml(html: string): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return decodeHtml(text);
}

export async function analyseWebsite(url: string): Promise<string> {
  const pageText = await fetchPageText(url);
  if (pageText.length < 50) {
    return `Website URL: ${url}

The website returned very little server-rendered content. It may require JavaScript to render, so treat this as weak website evidence and rely only on the current business profile unless specific facts are present elsewhere.`;
  }

  const text = await completeText(
    `Analyse this company/organisation website content and extract a structured intelligence summary that would help fill grant applications. Be specific and factual — only include information actually present on the page.

Website URL: ${url}

Page content:
${pageText.slice(0, MAX_HTML_CHARS)}

Extract the following (skip sections if not found on the page):

1. **What the company does** — products, services, core offering
2. **Mission & impact** — social impact, environmental goals, community benefit
3. **Key achievements** — awards, certifications, partnerships, milestones
4. **Team & expertise** — team size indicators, key expertise areas, leadership
5. **Market & sector** — target market, industry, geographic focus
6. **Innovation & R&D** — any technology, research, or innovation mentions
7. **Financial indicators** — revenue hints, growth stage, funding history
8. **Key differentiators** — what makes them unique, competitive advantages

Write a concise summary (max 800 words) in plain text. Use bullet points within sections. This will be fed to an AI filling grant applications, so focus on facts that grant evaluators care about: impact, innovation, capability, track record.`,
    2000
  );

  return text.slice(0, MAX_INTELLIGENCE_CHARS);
}
