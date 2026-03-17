import Anthropic from "@anthropic-ai/sdk";
import type { Page } from "playwright";
import type { FormFieldInfo } from "./browser.js";
import type { ProfileData } from "./profile-data.js";
import type { FillAction } from "./browser.js";
import type { RequiredAttachment } from "./required-attachments.js";

export interface GrantContext {
  name: string;
  funder: string;
  eligibility: string;
  description?: string;
  objectives?: string;
}

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const anthropic = new Anthropic({ apiKey: requiredEnv("ANTHROPIC_API_KEY") });

export interface MissingRequiredField {
  selector: string;
  label: string;
  hint?: string;
}

/**
 * Ask Claude to map profile data to form fields. Returns CSS selector + value for each field.
 */
export async function getFormFillActions(
  fields: FormFieldInfo[],
  profile: ProfileData,
  kind: "company" | "financial"
): Promise<FillAction[]> {
  const { actions } = await getFormFillActionsWithMissing(fields, profile, kind);
  return actions;
}

/** Options for vision-first filling: see the form and adapt to grant tone/requirements. */
export interface FormFillOptions {
  page: Page;
  grantContext: GrantContext;
}

/**
 * Like getFormFillActions but also returns required form fields that have no profile value.
 * When fillOptions (page + grantContext) is provided, uses vision-first: screenshot + grant context
 * so Claude sees the form and fills according to the grant's tone, theme, and requirements.
 */
export async function getFormFillActionsWithMissing(
  fields: FormFieldInfo[],
  profile: ProfileData,
  kind: "company" | "financial",
  userAnswers?: Record<string, string>,
  fillOptions?: FormFillOptions
): Promise<{ actions: FillAction[]; missingRequired: MissingRequiredField[] }> {
  if (fillOptions?.page && fillOptions?.grantContext) {
    return getFormFillActionsWithVision(fields, profile, kind, userAnswers, fillOptions);
  }
  return getFormFillActionsTextOnly(fields, profile, kind, userAnswers);
}

/** Vision-first: screenshot + grant context so values match the grant's tone and requirements. */
async function getFormFillActionsWithVision(
  fields: FormFieldInfo[],
  profile: ProfileData,
  kind: "company" | "financial",
  userAnswers: Record<string, string> | undefined,
  fillOptions: FormFillOptions
): Promise<{ actions: FillAction[]; missingRequired: MissingRequiredField[] }> {
  let screenshotBase64: string;
  try {
    const buf = await fillOptions.page.screenshot({ type: "png", fullPage: false });
    screenshotBase64 = buf.toString("base64");
  } catch {
    return getFormFillActionsTextOnly(fields, profile, kind, userAnswers);
  }

  const profileSlice =
    kind === "company"
      ? {
          businessName: profile.businessName,
          registrationNumber: profile.registrationNumber,
          location: profile.location,
          sector: profile.sector,
          missionStatement: profile.missionStatement,
          description: profile.description,
        }
      : {
          employeeCount: profile.employeeCount,
          annualRevenue: profile.annualRevenue,
          previousGrants: profile.previousGrants,
          fundingMin: profile.fundingMin,
          fundingMax: profile.fundingMax,
          fundingPurposes: profile.fundingPurposes,
          fundingDetails: profile.fundingDetails,
        };

  const grant = fillOptions.grantContext;
  const grantBlurb = [
    `Grant: ${grant.name}. Funder: ${grant.funder}.`,
    grant.eligibility ? `Eligibility: ${grant.eligibility.slice(0, 1500)}` : "",
    grant.description ? `Description: ${grant.description.slice(0, 1500)}` : "",
    grant.objectives ? `Objectives: ${String(grant.objectives).slice(0, 1000)}` : "",
  ].filter(Boolean).join("\n");

  const prompt = `You are filling a grant application form. You can SEE the form in the screenshot. Use it to understand the tone, theme, and any on-page instructions (word limits, format, focus areas).

Grant context (use this to adapt how you write – match this grant's focus and language):
${grantBlurb}

Form field metadata (use name or id for selector, e.g. input[name="company_name"] or #id). Respect maxLength and instruction:
${JSON.stringify(fields, null, 2)}

Applicant profile (${kind}) to draw from:
${JSON.stringify(profileSlice, null, 2)}
${userAnswers && Object.keys(userAnswers).length > 0 ? `\nUser-provided answers for missing fields:\n${JSON.stringify(userAnswers, null, 2)}` : ""}

Instructions:
- Fill each field using the profile data but ADAPT the wording and emphasis to fit THIS grant (its eligibility, objectives, and tone). Do not paste the same generic text for every grant.
- Respect each field's maxLength and any word/character limits in instruction.
- Return a single JSON object with two keys: "actions" (array of { "selector", "value", "type": "fill"|"select"|"check" }) and "missingRequired" (array of { "selector", "label", "hint" } for required fields with no value). Use the exact selectors from the field list.
- Return ONLY the JSON object, no markdown.`;

  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2500,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: screenshotBase64 } },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const text = res.content?.[0]?.type === "text" ? res.content[0].text : "";
  return parseFormFillResponse(text, fields);
}

/** Text-only mapping (fallback when no vision or grant context). */
async function getFormFillActionsTextOnly(
  fields: FormFieldInfo[],
  profile: ProfileData,
  kind: "company" | "financial",
  userAnswers?: Record<string, string>
): Promise<{ actions: FillAction[]; missingRequired: MissingRequiredField[] }> {
  const profileSlice =
    kind === "company"
      ? {
          businessName: profile.businessName,
          registrationNumber: profile.registrationNumber,
          location: profile.location,
          sector: profile.sector,
          missionStatement: profile.missionStatement,
          description: profile.description,
        }
      : {
          employeeCount: profile.employeeCount,
          annualRevenue: profile.annualRevenue,
          previousGrants: profile.previousGrants,
          fundingMin: profile.fundingMin,
          fundingMax: profile.fundingMax,
          fundingPurposes: profile.fundingPurposes,
          fundingDetails: profile.fundingDetails,
        };

  const prompt = `You are mapping business profile data to a grant application form.

Form fields (use name or id for selector, e.g. input[name="company_name"] or #company_name). Each field may include:
- maxLength: maximum characters allowed (you MUST not exceed this).
- instruction: helper text that may specify word/character limits (e.g. "Max 500 words", "200 characters max"). You MUST stay within these limits.
- required: if true, the field is mandatory.

${JSON.stringify(fields, null, 2)}

Profile data to use (${kind}):
${JSON.stringify(profileSlice, null, 2)}

Return a single JSON object with two keys:
1. "actions": array of fill actions. Each: { "selector": "css selector", "value": "string", "type": "fill" | "select" | "check" }.
   - Use "select" for dropdowns, "fill" for text/number/email/url, "check" for checkbox/radio.
   - Only include fields you can fill from the profile. For empty optional values omit the action.
   - Write values in a natural, human tone. You MUST respect each field's maxLength and any word/character limits in instruction. Truncate or shorten so the value never exceeds the limit. Follow any format or content instructions (e.g. "describe in 3 sentences").
2. "missingRequired": array of form fields that appear REQUIRED (required: true, or label suggests mandatory) but for which the profile has no value. Each: { "selector": "css selector", "label": "field label for user", "hint": "short hint what to enter" }.
   - Only include fields that are clearly required and missing from profile. Use empty array if none.
${userAnswers && Object.keys(userAnswers).length > 0 ? `\nThe user has already provided these values for previously missing fields (use these to fill the form; do not list them in missingRequired):\n${JSON.stringify(userAnswers, null, 2)}` : ""}

Return ONLY the JSON object, no markdown.`;

  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2500,
    messages: [{ role: "user", content: prompt }],
  });

  const text = res.content?.[0]?.type === "text" ? res.content[0].text : "";
  return parseFormFillResponse(text, fields);
}

function parseFormFillResponse(
  text: string,
  fields: FormFieldInfo[]
): { actions: FillAction[]; missingRequired: MissingRequiredField[] } {
  const jsonObjMatch = text.match(/\{[\s\S]*\}/);
  const jsonStr = jsonObjMatch ? jsonObjMatch[0] : text;
  try {
    const parsed = JSON.parse(jsonStr) as { actions?: unknown; missingRequired?: unknown };
    const actionsArr = Array.isArray(parsed.actions) ? parsed.actions : [];
    const actions = actionsArr
      .filter(
        (a): a is FillAction =>
          a != null &&
          typeof a === "object" &&
          typeof (a as FillAction).selector === "string" &&
          typeof (a as FillAction).value === "string"
      )
      .map((a) => ({
        selector: (a as FillAction).selector,
        value: String((a as FillAction).value),
        type: ((a as FillAction).type as "fill" | "select" | "check") || "fill",
      }));
    const missingRequired: MissingRequiredField[] = [];
    const missingArr = Array.isArray(parsed.missingRequired) ? parsed.missingRequired : [];
    for (const m of missingArr) {
      if (m != null && typeof m === "object" && typeof (m as { selector: string }).selector === "string" && typeof (m as { label: string }).label === "string") {
        missingRequired.push({
          selector: (m as { selector: string }).selector,
          label: (m as { label: string }).label,
          hint: typeof (m as { hint?: string }).hint === "string" ? (m as { hint: string }).hint : undefined,
        });
      }
    }
    return {
      actions: applyFieldLimits(actions, fields),
      missingRequired,
    };
  } catch {
    return { actions: [], missingRequired: [] };
  }
}

const DEFAULT_MAX_CHARS = 2000;

function truncateByChars(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).trim();
}

function truncateByWords(s: string, maxWords: number): string {
  const parts = s.trim().split(/\s+/);
  if (parts.length <= maxWords) return s;
  return parts.slice(0, maxWords).join(" ");
}

/** Parse "max N words" or "N words max" from instruction text. Returns first match or undefined. */
function parseMaxWordsFromInstruction(instruction: string | undefined): number | undefined {
  if (!instruction?.trim()) return undefined;
  const m = instruction.match(/(?:max(?:imum)?\s*)?(\d+)\s*words?|(\d+)\s*words?\s*(?:max|maximum)?/i);
  if (m) {
    const n = parseInt(m[1] ?? m[2], 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return undefined;
}

/** Build a map from selector (normalized) to FormFieldInfo for per-field limit lookup. */
function buildSelectorToFieldMap(fields: FormFieldInfo[]): Map<string, FormFieldInfo> {
  const map = new Map<string, FormFieldInfo>();
  for (const f of fields) {
    if (f.name) map.set(f.name.toLowerCase(), f);
    if (f.name) map.set(`[name="${f.name}"]`, f);
    if (f.name) map.set(`input[name="${f.name}"]`, f);
    if (f.id) map.set(f.id.toLowerCase(), f);
    if (f.id) map.set(`#${f.id}`, f);
  }
  return map;
}

/**
 * Apply per-field character/word limits from form metadata so values stay within requirements.
 * Uses field maxLength and instruction (e.g. "Max 500 words") when present; otherwise caps at DEFAULT_MAX_CHARS.
 */
function applyFieldLimits(
  actions: FillAction[],
  fields: FormFieldInfo[]
): FillAction[] {
  const selectorToField = buildSelectorToFieldMap(fields);
  return actions.map((a) => {
    if (a.type !== "fill" || typeof a.value !== "string") return a;
    let value = a.value;
    const field = findFieldForSelector(selectorToField, a.selector, fields);
    if (field) {
      const maxWords = parseMaxWordsFromInstruction(field.instruction);
      if (maxWords != null) value = truncateByWords(value, maxWords);
      if (field.maxLength != null) value = truncateByChars(value, field.maxLength);
    }
    value = truncateByChars(value, DEFAULT_MAX_CHARS);
    return { ...a, value };
  });
}

function findFieldForSelector(
  map: Map<string, FormFieldInfo>,
  selector: string,
  fields: FormFieldInfo[]
): FormFieldInfo | undefined {
  const normalized = selector.trim().toLowerCase();
  if (map.has(normalized)) return map.get(normalized);
  const nameMatch = normalized.match(/\[name=["']([^"']+)["']\]/);
  if (nameMatch) return map.get(nameMatch[1]) ?? map.get(`[name="${nameMatch[1]}"]`);
  const idMatch = normalized.match(/#([a-z0-9_-]+)/i);
  if (idMatch) return map.get(idMatch[1]) ?? map.get(`#${idMatch[1]}`);
  for (const f of fields) {
    if (f.name && (selector.includes(f.name) || normalized.includes(f.name.toLowerCase()))) return f;
    if (f.id && (selector.includes(f.id) || normalized.includes(f.id))) return f;
  }
  return undefined;
}

export interface FileInputMappingOptions {
  /** When provided, use vision: screenshot + on-page labels to match file inputs to documents. */
  page?: Page;
}

/**
 * Ask Claude to map file inputs on the page to document names (which file goes to which input).
 * When options.page is provided, uses vision (screenshot) so Claude can see labels and instructions.
 */
export async function getFileInputMapping(
  fileInputSelectors: string[],
  documentNames: string[],
  options?: FileInputMappingOptions
): Promise<Array<{ selector: string; documentIndex: number }>> {
  if (fileInputSelectors.length === 0 || documentNames.length === 0)
    return [];

  if (options?.page) {
    const visionResult = await getFileInputMappingWithVision(
      options.page,
      fileInputSelectors,
      documentNames
    );
    if (visionResult.length > 0) return visionResult;
  }

  return getFileInputMappingTextOnly(fileInputSelectors, documentNames);
}

/** Vision-first: screenshot so Claude sees file input labels and matches to document names. */
async function getFileInputMappingWithVision(
  page: Page,
  fileInputSelectors: string[],
  documentNames: string[]
): Promise<Array<{ selector: string; documentIndex: number }>> {
  let screenshotBase64: string;
  try {
    const buf = await page.screenshot({ type: "png", fullPage: false });
    screenshotBase64 = buf.toString("base64");
  } catch {
    return [];
  }

  const prompt = `You can SEE the form in the screenshot. There are file upload inputs; each may have a label or instruction (e.g. "Upload business plan", "Pitch video", "Financial statement").

File input CSS selectors (in DOM order) – match each to the best document by index:
${JSON.stringify(fileInputSelectors)}

Documents (0-based index -> name):
${documentNames.map((n, i) => `${i}: ${n}`).join("\n")}

Match each file input (by its visible label/instruction) to the most appropriate document. Return ONLY a JSON array: [ { "selector": "<exact selector from list>", "documentIndex": 0 }, ... ]. One entry per file input. documentIndex must be between 0 and ${documentNames.length - 1}.`;

  try {
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: screenshotBase64 } },
            { type: "text", text: prompt },
          ],
        },
      ],
    });
    const text = res.content?.[0]?.type === "text" ? res.content[0].text : "";
    return parseFileInputMappingResponse(text, fileInputSelectors, documentNames);
  } catch {
    return [];
  }
}

function parseFileInputMappingResponse(
  text: string,
  fileInputSelectors: string[],
  documentNames: string[]
): Array<{ selector: string; documentIndex: number }> {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  const jsonStr = jsonMatch ? jsonMatch[0] : text;
  try {
    const parsed = JSON.parse(jsonStr) as unknown;
    if (!Array.isArray(parsed)) return [];
    const maxIdx = documentNames.length - 1;
    const selectorSet = new Set(fileInputSelectors);
    return parsed
      .filter(
        (a): a is { selector: string; documentIndex: number } =>
          a != null &&
          typeof a === "object" &&
          typeof (a as { selector: string }).selector === "string" &&
          typeof (a as { documentIndex: number }).documentIndex === "number"
      )
      .map((a) => ({
        selector: a.selector,
        documentIndex: Math.min(Math.max(0, a.documentIndex), maxIdx),
      }))
      .filter((a) => selectorSet.has(a.selector));
  } catch {
    return [];
  }
}

function getFileInputMappingTextOnly(
  fileInputSelectors: string[],
  documentNames: string[]
): Promise<Array<{ selector: string; documentIndex: number }>> {
  const prompt = `We have file input CSS selectors and document names. Match each file input to the best document by index (0-based).

File inputs (selector -> assign one document index):
${JSON.stringify(fileInputSelectors)}

Documents (index -> name):
${documentNames.map((n, i) => `${i}: ${n}`).join("\n")}

Return ONLY a JSON array: [ { "selector": "...", "documentIndex": 0 }, ... ]. One entry per file input. documentIndex must be between 0 and ${documentNames.length - 1}.`;

  return anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  }).then((res) => {
    const text = res.content?.[0]?.type === "text" ? res.content[0].text : "";
    const parsed = parseFileInputMappingResponse(text, fileInputSelectors, documentNames);
    if (parsed.length > 0) return parsed;
    return fileInputSelectors.slice(0, documentNames.length).map((sel, i) => ({
      selector: sel,
      documentIndex: i % documentNames.length,
    }));
  });
}

/**
 * Extract required uploads (documents/videos) from the visible form using vision.
 * Use when Grant.required_attachments is empty so we can still match documents to file inputs.
 */
export async function extractRequiredAttachmentsFromPage(page: Page): Promise<RequiredAttachment[]> {
  let screenshotBase64: string;
  try {
    const buf = await page.screenshot({ type: "png", fullPage: false });
    screenshotBase64 = buf.toString("base64");
  } catch {
    return [];
  }
  const prompt = `Look at this screenshot of a grant application form. List every required file upload or attachment you can see (labels, instructions, e.g. "Upload business plan", "Pitch video max 5 min", "Financial statement PDF").

For each one return: kind ("video" or "document"), label (short label), categoryHint (one of: pitch_video, financial_statement, business_plan, company_profile, other), and optionally maxDurationMinutes (for video), maxSizeMB, accept (e.g. "application/pdf", "video/*").

Return ONLY a JSON array. Example: [{"kind":"document","label":"Business plan","categoryHint":"business_plan"},{"kind":"video","label":"Pitch video","categoryHint":"pitch_video","maxDurationMinutes":5}]. If no clear upload requirements are visible, return []. Do not invent requirements.`;

  try {
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: screenshotBase64 } },
            { type: "text", text: prompt },
          ],
        },
      ],
    });
    const text = res.content?.[0]?.type === "text" ? res.content[0].text : "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : text;
    const parsed = JSON.parse(jsonStr) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (a): a is RequiredAttachment =>
          a != null &&
          typeof a === "object" &&
          ((a as RequiredAttachment).kind === "video" || (a as RequiredAttachment).kind === "document") &&
          typeof (a as RequiredAttachment).label === "string"
      )
      .map((a) => ({
        kind: (a as RequiredAttachment).kind,
        label: String((a as RequiredAttachment).label),
        categoryHint: typeof (a as RequiredAttachment).categoryHint === "string" ? (a as RequiredAttachment).categoryHint : undefined,
        maxDurationMinutes: typeof (a as RequiredAttachment).maxDurationMinutes === "number" ? (a as RequiredAttachment).maxDurationMinutes : undefined,
        maxSizeMB: typeof (a as RequiredAttachment).maxSizeMB === "number" ? (a as RequiredAttachment).maxSizeMB : undefined,
        accept: typeof (a as RequiredAttachment).accept === "string" ? (a as RequiredAttachment).accept : undefined,
      }));
  } catch {
    return [];
  }
}
