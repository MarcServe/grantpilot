import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { getActiveOrg } from "@/lib/auth";

const requestSchema = z.object({
  action: z.enum(["recommend", "generate_summary", "generate_plan"]),
  businessName: z.string(),
  sector: z.string(),
  description: z.string(),
  missionStatement: z.string().optional(),
  employeeCount: z.number().nullable().optional(),
  annualRevenue: z.number().nullable().optional(),
  selectedPurposes: z.array(z.string()).optional(),
  fundingMin: z.number().optional(),
  fundingMax: z.number().optional(),
});

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  return new OpenAI({ apiKey });
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    await getActiveOrg();
    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { action, businessName, sector, description, missionStatement, employeeCount, annualRevenue, selectedPurposes, fundingMin, fundingMax } = parsed.data;
    const openai = getOpenAI();

    const profileContext = `Business: ${businessName}\nSector: ${sector}\nDescription: ${description}${missionStatement ? `\nMission: ${missionStatement}` : ""}${employeeCount ? `\nEmployees: ${employeeCount}` : ""}${annualRevenue ? `\nAnnual Revenue: £${annualRevenue.toLocaleString()}` : ""}`;

    if (action === "recommend") {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `You are a UK grant funding strategy advisor. Based on this business profile, recommend the best funding strategy.

${profileContext}

Return a JSON object with:
- "recommendedPurposes": array of strings from this exact list: ["Marketing & Customer Acquisition", "Product Development", "Research & Development", "Hiring & Team Expansion", "Equipment & Infrastructure", "Business Expansion / New Markets", "Working Capital", "Technology & Software", "Training & Skills Development", "Sustainability & Green Initiatives", "Export & International Growth", "Prototyping & Testing", "IP & Patent Filing", "Other"]
- "fundingRangeMin": recommended minimum funding in GBP (number)
- "fundingRangeMax": recommended maximum funding in GBP (number)
- "fundingRangeReason": one-line explanation of the suggested range
- "strategyHint": 2-3 sentence funding strategy insight for this business
- "compatibleGrantTypes": array of 3-5 grant category names this business would be eligible for (e.g. "Innovation Grants", "AI Development Grants")

Only return valid JSON, no markdown.`,
        }],
      });

      const text = response.choices[0]?.message?.content ?? "{}";
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const result = JSON.parse(cleaned);
      return NextResponse.json(result);
    }

    if (action === "generate_summary") {
      const purposes = selectedPurposes?.join(", ") || "general business development";
      const range = fundingMin && fundingMax ? `£${fundingMin.toLocaleString()} – £${fundingMax.toLocaleString()}` : "an appropriate amount";

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: `Write a concise, professional funding use summary for a grant application. 2-3 paragraphs max.

${profileContext}
Funding range: ${range}
Funding purposes: ${purposes}

Write in third person about the business. Include specific activities, expected outcomes, and why the funding is needed. Do not use markdown — plain text only.`,
        }],
      });

      return NextResponse.json({ summary: response.choices[0]?.message?.content ?? "" });
    }

    if (action === "generate_plan") {
      const purposes = selectedPurposes?.join(", ") || "general business development";
      const range = fundingMin && fundingMax ? `£${fundingMin.toLocaleString()} – £${fundingMax.toLocaleString()}` : "an appropriate amount";

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 800,
        messages: [{
          role: "user",
          content: `Create a funding strategy plan for a grant application. Include:
1. A brief funding strategy summary (2-3 sentences)
2. 4-6 key milestones with deliverables
3. Expected outcomes

${profileContext}
Funding range: ${range}
Funding purposes: ${purposes}

Return as JSON:
{
  "summary": "strategy summary text",
  "milestones": ["milestone 1", "milestone 2", ...],
  "outcomes": ["outcome 1", "outcome 2", ...]
}

Only return valid JSON, no markdown.`,
        }],
      });

      const text = response.choices[0]?.message?.content ?? "{}";
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const raw = JSON.parse(cleaned) as { summary?: string; milestones?: unknown[]; outcomes?: unknown[] };
      const toStr = (x: unknown): string => {
        if (typeof x === "string") return x;
        if (x != null && typeof x === "object") {
          const o = x as Record<string, unknown>;
          const s =
            (typeof o.text === "string" && o.text) ||
            (typeof o.milestone === "string" && o.milestone) ||
            (typeof o.content === "string" && o.content) ||
            (typeof o.title === "string" && o.title) ||
            (typeof o.description === "string" && o.description);
          if (s) return s;
        }
        return String(x ?? "");
      };
      const result = {
        summary: typeof raw.summary === "string" ? raw.summary : "",
        milestones: Array.isArray(raw.milestones) ? raw.milestones.map(toStr) : [],
        outcomes: Array.isArray(raw.outcomes) ? raw.outcomes.map(toStr) : [],
      };
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("[FUNDING_STRATEGY]", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
