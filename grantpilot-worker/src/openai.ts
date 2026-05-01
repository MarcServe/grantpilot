import OpenAI from "openai";

let client: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!client) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Missing env var: OPENAI_API_KEY");
    client = new OpenAI({ apiKey: key });
  }
  return client;
}

export async function completeJsonWithOpenAI(prompt: string, maxTokens = 4000): Promise<string> {
  const response = await getOpenAI().chat.completions.create({
    model: process.env.OPENAI_WORKER_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });
  return response.choices[0]?.message?.content ?? "{}";
}
