import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * One required attachment for a grant (video or document with optional constraints).
 */
export interface RequiredAttachment {
  kind: "video" | "document";
  label: string;
  /** Suggested category for matching user documents: pitch_video, financial_statement, etc. */
  categoryHint?: string;
  /** Max duration in minutes (for video). */
  maxDurationMinutes?: number;
  /** Max file size in MB. */
  maxSizeMB?: number;
  /** MIME accept hint for documents, e.g. application/pdf, video/*. */
  accept?: string;
}

/**
 * Parse grant eligibility/description text to extract required attachments
 * (e.g. "pitch video max 5 minutes, 50MB", "upload financial statement PDF").
 */
export async function parseRequiredAttachmentsFromText(
  text: string
): Promise<RequiredAttachment[]> {
  if (!text?.trim()) return [];

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Extract required uploads/attachments from this grant text. Focus on:
- Video requirements (e.g. "pitch video", "5 minute video", "max 50MB video")
- Document requirements (e.g. "financial statement", "business plan PDF", "accounts")

Grant text:
${text.slice(0, 8000)}

Return ONLY a JSON array. Each item:
{ "kind": "video" or "document", "label": "short label", "categoryHint": "pitch_video|financial_statement|business_plan|company_profile|other", "maxDurationMinutes": number or omit, "maxSizeMB": number or omit, "accept": "video/*" or "application/pdf" or omit }

If no clear requirements found, return []. Do not invent requirements.`,
      },
    ],
  });

  const raw =
    response.content[0].type === "text" ? response.content[0].text : "";
  const match = raw.match(/\[[\s\S]*\]/);
  const jsonStr = match ? match[0] : raw;

  try {
    const parsed = JSON.parse(jsonStr) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (a): a is RequiredAttachment =>
          a != null &&
          typeof a === "object" &&
          ((a as RequiredAttachment).kind === "video" ||
            (a as RequiredAttachment).kind === "document") &&
          typeof (a as RequiredAttachment).label === "string"
      )
      .map((a) => ({
        kind: a.kind as "video" | "document",
        label: String(a.label),
        categoryHint:
          typeof (a as RequiredAttachment).categoryHint === "string"
            ? (a as RequiredAttachment).categoryHint
            : undefined,
        maxDurationMinutes:
          typeof (a as RequiredAttachment).maxDurationMinutes === "number"
            ? (a as RequiredAttachment).maxDurationMinutes
            : undefined,
        maxSizeMB:
          typeof (a as RequiredAttachment).maxSizeMB === "number"
            ? (a as RequiredAttachment).maxSizeMB
            : undefined,
        accept:
          typeof (a as RequiredAttachment).accept === "string"
            ? (a as RequiredAttachment).accept
            : undefined,
      }));
  } catch {
    return [];
  }
}

/** Standard document categories we suggest to users and match in the worker. */
export const DOCUMENT_CATEGORIES = [
  { value: "pitch_video", label: "Pitch / explainer video" },
  { value: "financial_statement", label: "Financial statement / accounts" },
  { value: "business_plan", label: "Business plan" },
  { value: "company_profile", label: "Company profile" },
  { value: "other", label: "Other" },
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]["value"];

/**
 * Compare grant required_attachments to user documents (by category and type).
 * Returns { met, missing } for display.
 */
export function checkRequirementsAgainstDocuments(
  required: RequiredAttachment[],
  documents: { category?: string | null; type?: string; name: string }[]
): { met: RequiredAttachment[]; missing: RequiredAttachment[] } {
  const met: RequiredAttachment[] = [];
  const missing: RequiredAttachment[] = [];
  const used = new Set<number>();

  for (const req of required) {
    const hint = req.categoryHint ?? (req.kind === "video" ? "pitch_video" : "other");
    const isVideo = req.kind === "video";
    const found = documents.some((d, i) => {
      if (used.has(i)) return false;
      const cat = d.category ?? "";
      const type = (d.type ?? "").toLowerCase();
      const matchCategory = cat === hint || (hint === "other" && !!cat);
      const matchVideo = isVideo && (type.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(d.name));
      const matchDoc = !isVideo && (matchCategory || type.includes("pdf") || type.includes("document"));
      if ((isVideo && matchVideo) || (!isVideo && (matchCategory || matchDoc))) {
        used.add(i);
        return true;
      }
      return false;
    });
    if (found) met.push(req);
    else missing.push(req);
  }
  return { met, missing };
}
