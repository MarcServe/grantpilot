import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

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
    return stripHtml(html).slice(0, MAX_HTML_CHARS);
  } finally {
    clearTimeout(timeout);
  }
}

function stripHtml(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

export async function analyseWebsite(url: string): Promise<string> {
  const pageText = await fetchPageText(url);
  if (pageText.length < 50) {
    throw new Error(
      "Could not extract meaningful content from the website. It may require JavaScript to render."
    );
  }

  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Analyse this company/organisation website content and extract a structured intelligence summary that would help fill grant applications. Be specific and factual — only include information actually present on the page.

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
      },
    ],
  });

  const text = res.content?.[0]?.type === "text" ? res.content[0].text : "";
  return text.slice(0, MAX_INTELLIGENCE_CHARS);
}
