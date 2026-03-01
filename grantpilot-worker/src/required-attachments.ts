import type { DocumentData } from "./profile-data.js";

export interface RequiredAttachment {
  kind: "video" | "document";
  label: string;
  categoryHint?: string;
  maxDurationMinutes?: number;
  maxSizeMB?: number;
  accept?: string;
}

/**
 * Match grant required_attachments to user documents by kind and category.
 * Returns for each requirement either the index of the document to use or -1 if missing.
 */
export function matchDocumentsToRequirements(
  required: RequiredAttachment[],
  documents: DocumentData[]
): { documentIndex: number; requirement: RequiredAttachment }[] {
  const used = new Set<number>();
  const result: { documentIndex: number; requirement: RequiredAttachment }[] = [];

  for (const req of required) {
    const hint = req.categoryHint ?? (req.kind === "video" ? "pitch_video" : "other");
    const isVideo = req.kind === "video";
    let bestIdx = -1;
    let bestScore = 0;

    for (let i = 0; i < documents.length; i++) {
      if (used.has(i)) continue;
      const d = documents[i];
      const cat = d.category ?? "";
      const type = (d.type ?? "").toLowerCase();
      const name = (d.name ?? "").toLowerCase();
      const isDocVideo = type.startsWith("video/") || /\.(mp4|webm|mov)$/.test(name);
      let score = 0;
      if (isVideo && isDocVideo) {
        score = cat === hint ? 2 : 1;
      } else if (!isVideo) {
        if (cat === hint) score = 2;
        else if (type.includes("pdf") || type.includes("document") || /\.(pdf|docx?)$/.test(name)) score = 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) used.add(bestIdx);
    result.push({ documentIndex: bestIdx, requirement: req });
  }
  return result;
}

/**
 * Given file input selectors and matched (requirement -> document index),
 * build ordered selectors and document URLs for upload (skip slots with no document).
 */
export function buildUploadPlan(
  selectors: string[],
  documents: DocumentData[],
  matched: { documentIndex: number; requirement: RequiredAttachment }[]
): { selectors: string[]; documentUrls: string[]; missing: string[] } {
  const missing: string[] = [];
  const selectorsOut: string[] = [];
  const documentUrlsOut: string[] = [];

  for (let i = 0; i < matched.length && i < selectors.length; i++) {
    const m = matched[i];
    if (m.documentIndex >= 0 && documents[m.documentIndex]) {
      selectorsOut.push(selectors[i]);
      documentUrlsOut.push(documents[m.documentIndex].url);
    } else {
      missing.push(m.requirement.label);
    }
  }
  return { selectors: selectorsOut, documentUrls: documentUrlsOut, missing };
}
