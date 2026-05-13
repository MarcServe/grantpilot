/**
 * V1 production source policy:
 * - Discovery can come from multiple finders: OpenAI, Perplexity, Gemini, manual/feed imports,
 *   and future Bing/Google search APIs.
 * - Eligibility, trusted matching, digests, and deadline reminders must pass through
 *   the OpenAI checker before they count as high-confidence matches.
 */
export function isOpenAIChecked(scoringSource?: string | null): boolean {
  return scoringSource === "openai";
}

export function grantFinderLabel(source?: string | null): string | null {
  if (!source) return null;
  return source === "openai" ? "OpenAI sourced" : "Found in database";
}
