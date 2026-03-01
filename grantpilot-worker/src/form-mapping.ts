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

/**
 * Ask Claude to map profile data to form fields. Returns CSS selector + value for each field.
 */
export async function getFormFillActions(
  fields: FormFieldInfo[],
  profile: ProfileData,
  kind: "company" | "financial"
): Promise<FillAction[]> {
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

Return ONLY a JSON array of actions. Each action: { "selector": "css selector for the input/select/textarea", "value": "string value to fill", "type": "fill" | "select" | "check" }.
- Use "select" for dropdowns (value = option value or label).
- Use "fill" for text/number/email/url.
- Use "check" for checkbox/radio (value = "true" or "false").
- Selector must be valid CSS (e.g. input[name="x"], #id, select[name="x"]).
- Only include fields you can match from the form. Skip unknown fields.
- For numbers use string representation.
- For empty optional values you may omit the action.`;

  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
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
  } catch {
    return [];
  }
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
