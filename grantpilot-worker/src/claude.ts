import Anthropic from "@anthropic-ai/sdk";

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("Missing env var: ANTHROPIC_API_KEY");
    _anthropic = new Anthropic({ apiKey: key });
  }
  return _anthropic;
}

export async function extractEmailFromUrl(
  url: string
): Promise<{ email?: string; companyName?: string; notes?: string }> {
  const prompt = `You are extracting public contact emails from websites.
Return ONLY valid JSON with keys: email (string|null), companyName (string|null), notes (string|null).

Website URL: ${url}

Rules:
- Prefer a general contact email (info@, hello@, enquiries@, support@).
- If none found, return email as null and explain in notes.
- Do NOT hallucinate emails.`;

  const res = await getAnthropic().messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  });

  const text = res.content?.[0]?.type === "text" ? res.content[0].text : "";

  try {
    const parsed = JSON.parse(text);
    return {
      email: parsed.email ?? undefined,
      companyName: parsed.companyName ?? undefined,
      notes: parsed.notes ?? undefined,
    };
  } catch {
    return { email: undefined, companyName: undefined, notes: "Model returned invalid JSON." };
  }
}

