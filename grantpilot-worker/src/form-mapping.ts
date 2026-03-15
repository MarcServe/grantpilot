import Anthropic from "@anthropic-ai/sdk";
import type { FormFieldInfo } from "./browser.js";
import type { ProfileData } from "./profile-data.js";
import type { FillAction } from "./browser.js";

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

/**
 * Like getFormFillActions but also returns required form fields that have no profile value.
 * Used to pause and ask the user for missing info before continuing.
 */
export async function getFormFillActionsWithMissing(
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

Form fields (use name or id for selector, e.g. input[name="company_name"] or #company_name):
${JSON.stringify(fields, null, 2)}

Profile data to use (${kind}):
${JSON.stringify(profileSlice, null, 2)}

Return a single JSON object with two keys:
1. "actions": array of fill actions. Each: { "selector": "css selector", "value": "string", "type": "fill" | "select" | "check" }.
   - Use "select" for dropdowns, "fill" for text/number/email/url, "check" for checkbox/radio.
   - Only include fields you can fill from the profile. For empty optional values omit the action.
   - Write values in a natural, human tone. Respect character/word limits suggested by labels.
2. "missingRequired": array of form fields that appear REQUIRED (e.g. required attribute, or label suggests mandatory) but for which the profile has no value. Each: { "selector": "css selector", "label": "field label for user", "hint": "short hint what to enter" }.
   - Only include fields that are clearly required and missing from profile. Use empty array if none.
${userAnswers && Object.keys(userAnswers).length > 0 ? `\nThe user has already provided these values for previously missing fields (use these to fill the form; do not list them in missingRequired):\n${JSON.stringify(userAnswers, null, 2)}` : ""}

Return ONLY the JSON object, no markdown.`;

  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2500,
    messages: [{ role: "user", content: prompt }],
  });

  const text = res.content?.[0]?.type === "text" ? res.content[0].text : "";
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
      actions: applyFieldLimits(actions, 2000),
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

/**
 * Apply character/word limits to fill action values to avoid overflow and reduce AI-style length.
 */
function applyFieldLimits(
  actions: FillAction[],
  defaultMaxChars: number = DEFAULT_MAX_CHARS
): FillAction[] {
  return actions.map((a) => {
    if (a.type !== "fill" || typeof a.value !== "string") return a;
    let value = a.value;
    value = truncateByChars(value, defaultMaxChars);
    return { ...a, value };
  });
}

/**
 * Ask Claude to map file inputs on the page to document names (which file goes to which input).
 */
export async function getFileInputMapping(
  fileInputSelectors: string[],
  documentNames: string[]
): Promise<Array<{ selector: string; documentIndex: number }>> {
  if (fileInputSelectors.length === 0 || documentNames.length === 0)
    return [];

  const prompt = `We have file input CSS selectors and document names. Match each file input to the best document by index (0-based).

File inputs (selector -> assign one document index):
${JSON.stringify(fileInputSelectors)}

Documents (index -> name):
${documentNames.map((n, i) => `${i}: ${n}`).join("\n")}

Return ONLY a JSON array: [ { "selector": "...", "documentIndex": 0 }, ... ]. One entry per file input. documentIndex must be between 0 and ${documentNames.length - 1}.`;

  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  const text = res.content?.[0]?.type === "text" ? res.content[0].text : "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  const jsonStr = jsonMatch ? jsonMatch[0] : text;

  try {
    const parsed = JSON.parse(jsonStr) as unknown;
    if (!Array.isArray(parsed)) return [];
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
        documentIndex: Math.min(Math.max(0, a.documentIndex), documentNames.length - 1),
      }));
  } catch {
    return fileInputSelectors.slice(0, documentNames.length).map((sel, i) => ({
      selector: sel,
      documentIndex: i % documentNames.length,
    }));
  }
}
