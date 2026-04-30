import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  if (!client) client = new OpenAI({ apiKey });
  return client;
}

export function cleanJsonResponse(raw: string): string {
  const text = raw.trim();
  const fenceMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return fenceMatch ? fenceMatch[1].trim() : text;
}

export async function completeJson(prompt: string, maxTokens = 1600): Promise<string> {
  const response = await getOpenAIClient().chat.completions.create({
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });
  return response.choices[0]?.message?.content ?? "{}";
}

export async function completeText(prompt: string, maxTokens = 2000): Promise<string> {
  const response = await getOpenAIClient().chat.completions.create({
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  return response.choices[0]?.message?.content ?? "";
}
