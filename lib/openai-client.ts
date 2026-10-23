import { getAIProviderKey } from "@/lib/ai-provider-settings";
import OpenAI from "openai";

let client: OpenAI | null = null;
let clientKey: string | null = null;

export async function getOpenAIClient(): Promise<OpenAI> {
  const apiKey = await getAIProviderKey("openai");
  if (!apiKey) throw new Error("OpenAI API key is not configured");
  if (!client || clientKey !== apiKey) { client = new OpenAI({ apiKey }); clientKey = apiKey; }
  return client;
}

export function cleanJsonResponse(raw: string): string {
  const text = raw.trim();
  const fenceMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return fenceMatch ? fenceMatch[1].trim() : text;
}

export async function completeJson(prompt: string, maxTokens = 1600, options?: { timeout?: number; maxRetries?: number }): Promise<string> {
  const response = await (await getOpenAIClient()).chat.completions.create({
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  }, options);
  return response.choices[0]?.message?.content ?? "{}";
}

export async function completeText(prompt: string, maxTokens = 2000): Promise<string> {
  const response = await (await getOpenAIClient()).chat.completions.create({
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  return response.choices[0]?.message?.content ?? "";
}
