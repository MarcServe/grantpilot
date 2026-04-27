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

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("Missing env var: ANTHROPIC_API_KEY");
    _anthropic = new Anthropic({ apiKey: key });
  }
  return _anthropic;
}

export interface MissingRequiredField {
  selector: string;
  label: string;
  hint?: string;
}

type FormFillKind = "company" | "financial" | "application";

function normalizeAnswerText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function optionMatchesAnswer(option: { label: string; value: string }, answer: string): boolean {
  const wanted = normalizeAnswerText(answer);
  const label = normalizeAnswerText(option.label);
  const value = normalizeAnswerText(option.value);
  if (!wanted) return false;
  return label === wanted || value === wanted || label.includes(wanted) || wanted.includes(label);
}

function directChoiceActionsFromUserAnswers(
  fields: FormFieldInfo[],
  userAnswers?: Record<string, string>
): FillAction[] {
  if (!userAnswers || Object.keys(userAnswers).length === 0) return [];
  const actions: FillAction[] = [];
  const answerEntries = Object.entries(userAnswers)
    .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
    .map(([label, value]) => ({ key: normalizeAnswerText(label), value: value.trim() }));

  for (const field of fields) {
    const type = field.type?.toLowerCase();
    if (type !== "radio_group" && type !== "checkbox_group" && type !== "select") continue;
    const selector = field.selector;
    const options = field.options ?? [];
    if (!selector || options.length === 0) continue;
    const fieldLabel = normalizeAnswerText(field.label);
    const answer = answerEntries.find((entry) => fieldLabel.includes(entry.key) || entry.key.includes(fieldLabel));
    if (!answer) continue;
    const option = options.find((candidate) => optionMatchesAnswer(candidate, answer.value));
    if (!option) continue;
    actions.push({
      selector,
      value: option.label || option.value,
      type: type === "select" ? "select" : type === "radio_group" ? "choose_radio" : "choose_checkbox",
    });
  }

  return actions;
}

/**
 * Ask Claude to map profile data to form fields. Returns CSS selector + value for each field.
 */
export async function getFormFillActions(
  fields: FormFieldInfo[],
  profile: ProfileData,
  kind: FormFillKind
): Promise<FillAction[]> {
  const { actions } = await getFormFillActionsWithMissing(fields, profile, kind);
  return actions;
}

/** Options for vision-first filling: see the form and adapt to grant tone/requirements. */
export interface FormFillOptions {
  page: Page;
  grantContext: GrantContext;
  /** User-provided notes guiding what to emphasise for this specific grant. */
  focusNotes?: string;
  /** Portal section name (e.g. "business_case", "scope") — tailors Claude's focus per section. */
  sectionName?: string;
  /** Profile fields most relevant to this section (from portal recipe). */
  sectionProfileFocus?: string;
}

/**
 * Like getFormFillActions but also returns required form fields that have no profile value.
 * When fillOptions (page + grantContext) is provided, uses vision-first: screenshot + grant context
 * so Claude sees the form and fills according to the grant's tone, theme, and requirements.
 */
export async function getFormFillActionsWithMissing(
  fields: FormFieldInfo[],
  profile: ProfileData,
  kind: FormFillKind,
  userAnswers?: Record<string, string>,
  fillOptions?: FormFillOptions
): Promise<{ actions: FillAction[]; missingRequired: MissingRequiredField[] }> {
  const directChoiceActions = directChoiceActionsFromUserAnswers(fields, userAnswers);
  if (directChoiceActions.length > 0) {
    return { actions: directChoiceActions, missingRequired: [] };
  }
  if (fillOptions?.page && fillOptions?.grantContext) {
    return getFormFillActionsWithVision(fields, profile, kind, userAnswers, fillOptions);
  }
  return getFormFillActionsTextOnly(fields, profile, kind, userAnswers);
}

/**
 * Build rich context sections from the profile for use in fill prompts.
 * Selectively includes only non-empty sections, keeping the prompt focused.
 */
function buildRichProfileContext(profile: ProfileData): string {
  const sections: string[] = [];
  const legalAndContact = [
    profile.tradingName ? `Trading name: ${profile.tradingName}` : "",
    profile.charityNumber ? `Charity number: ${profile.charityNumber}` : "",
    profile.vatNumber ? `VAT number: ${profile.vatNumber}` : "",
    profile.yearEstablished ? `Year established: ${profile.yearEstablished}` : "",
    profile.registeredAddress ? `Registered address: ${profile.registeredAddress}` : "",
    profile.operatingAddress ? `Operating address: ${profile.operatingAddress}` : "",
    profile.postcode ? `Postcode: ${profile.postcode}` : "",
    profile.country ? `Country: ${profile.country}` : "",
    profile.region ? `Region: ${profile.region}` : "",
    profile.primaryContactName ? `Primary contact: ${profile.primaryContactName}` : "",
    profile.primaryContactRole ? `Contact role: ${profile.primaryContactRole}` : "",
    profile.primaryContactEmail ? `Contact email: ${profile.primaryContactEmail}` : "",
    profile.primaryContactPhone ? `Contact phone: ${profile.primaryContactPhone}` : "",
    profile.primaryContactLinkedIn ? `Contact LinkedIn: ${profile.primaryContactLinkedIn}` : "",
    profile.preferredContactMethod ? `Preferred contact: ${profile.preferredContactMethod}` : "",
  ].filter(Boolean).join("\n");
  if (legalAndContact) sections.push(`LEGAL, ADDRESS & CONTACT DETAILS:\n${legalAndContact}`);
  const financials = [
    profile.contractorCount != null ? `Contractors: ${profile.contractorCount}` : "",
    profile.profitLoss ? `Profit/loss: ${profile.profitLoss}` : "",
    profile.cashReserves ? `Cash reserves/runway: ${profile.cashReserves}` : "",
    profile.financialProjections ? `Financial projections: ${profile.financialProjections}` : "",
    profile.coFundingAvailable ? `Co-funding available: ${profile.coFundingAvailable}` : "",
    profile.matchFundingDetails ? `Match funding: ${profile.matchFundingDetails}` : "",
  ].filter(Boolean).join("\n");
  if (financials) sections.push(`DETAILED FINANCIALS & MATCH FUNDING:\n${financials}`);
  if (profile.directorNames || profile.directorProfiles) {
    sections.push(`DIRECTORS / FOUNDERS:\n${[profile.directorNames, profile.directorProfiles].filter(Boolean).join("\n")}`);
  }
  if (profile.teamMembers) {
    sections.push(`TEAM MEMBERS / KEY STAFF (one person per line; use all relevant people when asked about team capability):\n${profile.teamMembers}`);
  }
  if (profile.boardMembers || profile.founderBackground) {
    sections.push(`GOVERNANCE & FOUNDER BACKGROUND:\n${[profile.boardMembers, profile.founderBackground].filter(Boolean).join("\n")}`);
  }
  const project = [
    profile.projectTitle ? `Project title: ${profile.projectTitle}` : "",
    profile.projectSummary ? `Summary: ${profile.projectSummary}` : "",
    profile.problemStatement ? `Problem: ${profile.problemStatement}` : "",
    profile.proposedSolution ? `Solution: ${profile.proposedSolution}` : "",
    profile.projectObjectives ? `Objectives: ${profile.projectObjectives}` : "",
    profile.expectedOutcomes ? `Expected outcomes: ${profile.expectedOutcomes}` : "",
    profile.projectStartDate ? `Start: ${profile.projectStartDate}` : "",
    profile.projectEndDate ? `End: ${profile.projectEndDate}` : "",
    profile.milestones ? `Milestones: ${profile.milestones}` : "",
    profile.deliverables ? `Deliverables: ${profile.deliverables}` : "",
  ].filter(Boolean).join("\n");
  if (project) sections.push(`PROJECT BRIEF:\n${project}`);
  const impact = [
    profile.beneficiaryGroups ? `Beneficiaries: ${profile.beneficiaryGroups}` : "",
    profile.beneficiaryCount != null ? `Beneficiary count: ${profile.beneficiaryCount}` : "",
    profile.geographicImpact ? `Geographic impact: ${profile.geographicImpact}` : "",
    profile.diversityInclusionImpact ? `Diversity and inclusion: ${profile.diversityInclusionImpact}` : "",
    profile.jobsCreated != null ? `Jobs created/safeguarded: ${profile.jobsCreated}` : "",
    profile.revenueGrowthExpected ? `Revenue growth expected: ${profile.revenueGrowthExpected}` : "",
    profile.co2Reduction ? `CO2 reduction: ${profile.co2Reduction}` : "",
    profile.productivityImprovements ? `Productivity improvements: ${profile.productivityImprovements}` : "",
  ].filter(Boolean).join("\n");
  if (impact) sections.push(`IMPACT, BENEFICIARIES & KPIS:\n${impact}`);
  if (profile.partnerOrganisations || profile.collaborationDetails) {
    sections.push(`PARTNERSHIPS & COLLABORATION:\n${[profile.partnerOrganisations, profile.collaborationDetails].filter(Boolean).join("\n")}`);
  }
  if (profile.risksMitigation || profile.exitStrategy || profile.projectSustainabilityPlan) {
    sections.push(`RISK, EXIT & SUSTAINABILITY:\n${[profile.risksMitigation, profile.exitStrategy, profile.projectSustainabilityPlan].filter(Boolean).join("\n")}`);
  }
  if (profile.keyAchievements) sections.push(`KEY ACHIEVEMENTS & MILESTONES:\n${profile.keyAchievements}`);
  if (profile.socialImpact) sections.push(`SOCIAL IMPACT:\n${profile.socialImpact}`);
  if (profile.innovationCapabilities) sections.push(`INNOVATION & R&D:\n${profile.innovationCapabilities}`);
  if (profile.sustainabilityInitiatives) sections.push(`SUSTAINABILITY & ESG:\n${profile.sustainabilityInitiatives}`);
  if (profile.communityEngagement) sections.push(`COMMUNITY & PARTNERSHIPS:\n${profile.communityEngagement}`);
  if (profile.teamExpertise) sections.push(`TEAM EXPERTISE:\n${profile.teamExpertise}`);
  if (profile.websiteIntelligence) sections.push(`WEBSITE INTELLIGENCE (use specific facts and achievements from here):\n${profile.websiteIntelligence}`);
  if (profile.learnedApplicationAnswers && Object.keys(profile.learnedApplicationAnswers).length > 0) {
    const learned = Object.entries(profile.learnedApplicationAnswers)
      .slice(0, 20)
      .map(([label, value]) => `- ${label}: ${String(value).slice(0, 800)}`)
      .join("\n");
    sections.push(`LEARNED ANSWERS FROM PREVIOUS APPLICATIONS (reuse only when the new question asks for the same facts; adapt wording to this grant):\n${learned}`);
  }
  if (sections.length === 0) return "";
  return `\nRich profile sections (selectively use the most relevant sections for THIS grant — do not dump everything):\n${sections.join("\n\n")}\n`;
}

/** Vision-first: screenshot + grant context so values match the grant's tone and requirements. */
async function getFormFillActionsWithVision(
  fields: FormFieldInfo[],
  profile: ProfileData,
  kind: FormFillKind,
  userAnswers: Record<string, string> | undefined,
  fillOptions: FormFillOptions
): Promise<{ actions: FillAction[]; missingRequired: MissingRequiredField[] }> {
  let screenshotBase64: string;
  try {
    const buf = await fillOptions.page.screenshot({ type: "png", fullPage: false });
    screenshotBase64 = buf.toString("base64");
  } catch {
    return getFormFillActionsTextOnly(fields, profile, kind, userAnswers, fillOptions);
  }

  const profileSlice =
    kind === "financial"
      ? {
          employeeCount: profile.employeeCount,
          annualRevenue: profile.annualRevenue,
          previousGrants: profile.previousGrants,
          fundingMin: profile.fundingMin,
          fundingMax: profile.fundingMax,
          fundingPurposes: profile.fundingPurposes,
          fundingDetails: profile.fundingDetails,
          coFundingAvailable: profile.coFundingAvailable,
          matchFundingDetails: profile.matchFundingDetails,
        }
      : {
          businessName: profile.businessName,
          registrationNumber: profile.registrationNumber,
          location: profile.location,
          sector: profile.sector,
          missionStatement: profile.missionStatement,
          description: profile.description,
          primaryContactName: profile.primaryContactName,
          primaryContactEmail: profile.primaryContactEmail,
          primaryContactPhone: profile.primaryContactPhone,
          directorNames: profile.directorNames,
          directorProfiles: profile.directorProfiles,
          teamMembers: profile.teamMembers,
          projectTitle: profile.projectTitle,
          projectSummary: profile.projectSummary,
          problemStatement: profile.problemStatement,
          proposedSolution: profile.proposedSolution,
          projectObjectives: profile.projectObjectives,
          expectedOutcomes: profile.expectedOutcomes,
          beneficiaryGroups: profile.beneficiaryGroups,
          partnerOrganisations: profile.partnerOrganisations,
          collaborationDetails: profile.collaborationDetails,
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

  const richContext = buildRichProfileContext(profile);

  const focusDirective = fillOptions.focusNotes
    ? `\nAPPLICANT'S FOCUS DIRECTIVE (the applicant specifically wants you to emphasise these aspects for this grant):\n${fillOptions.focusNotes}\n`
    : "";

  const sectionDirective = fillOptions.sectionName
    ? `\nYou are filling the "${fillOptions.sectionName.replace(/_/g, " ")}" section of a multi-section application wizard.${fillOptions.sectionProfileFocus ? ` Focus on these profile aspects: ${fillOptions.sectionProfileFocus}.` : ""} Tailor every answer to what this specific section expects.\n`
    : "";

  const prompt = `You are an autonomous browser grant-application agent working through Playwright. You can SEE the form in the screenshot, but Playwright will execute only the JSON actions you return.

Grant context (use this to adapt how you write – match this grant's focus and language):
${grantBlurb}
${focusDirective}${sectionDirective}
Form schema metadata (use exact selectors. Treat each entry as a schema field, not just a DOM input). Respect type, options, maxLength, required, and instruction:
${JSON.stringify(fields, null, 2)}

Core applicant profile (${kind}; use alongside rich profile sections):
${JSON.stringify(profileSlice, null, 2)}
${richContext}${userAnswers && Object.keys(userAnswers).length > 0 ? `\nUser-provided answers for missing fields:\n${JSON.stringify(userAnswers, null, 2)}` : ""}

Instructions:
- First decide whether each visible field is safe to answer from the applicant profile, user answers, grant context, documents, or learned memory. Answer every visible application field you can answer safely, not only company fields. Never invent eligibility facts, partnerships, certifications, revenue, awards, directors, or declarations.
- For radio buttons and checkboxes, treat each question as a choice group. Choose by visible option label using type "choose_radio" or "choose_checkbox"; do not use a raw Yes/No value unless that is the visible option and the profile supports it.
- For eligibility gate questions, answer truthfully. If the applicant does not meet the gate or the answer is unknown, add the field to missingRequired instead of selecting a convenient answer.
- You are writing a TAILORED application, not a generic one. Analyse what THIS grant cares about (from its name, funder, eligibility, objectives, description) and emphasise the profile aspects that align best.
- For descriptive/narrative fields: write compelling, specific answers that connect the applicant's strengths to what this funder values. Use concrete numbers, achievements, and examples from the rich profile sections.
- If the grant focuses on innovation → emphasise R&D, IP, technical capabilities. If social impact → emphasise community work, beneficiaries, outcomes. If sustainability → emphasise ESG, green initiatives. Adapt accordingly.
- If the applicant provided focus notes, prioritise what they asked you to emphasise.
- Respect each field's maxLength and any word/character limits in instruction.
- For contenteditable/rich text editors, use type "rich_text". For address/company lookup fields that show suggestions, use type "autocomplete". For date and range fields, use type "date" or "range".
- Return a single JSON object with two keys: "actions" (array of { "selector", "value", "type": "fill"|"select"|"check"|"choose_radio"|"choose_checkbox"|"rich_text"|"autocomplete"|"date"|"range" }) and "missingRequired" (array of { "selector", "label", "hint" } for required fields with no value). Use the exact selectors from the field list.
- Return ONLY the JSON object, no markdown.`;

  const res = await getAnthropic().messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
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

/** Text-only mapping (fallback when no vision available; still uses grant context if provided). */
async function getFormFillActionsTextOnly(
  fields: FormFieldInfo[],
  profile: ProfileData,
  kind: FormFillKind,
  userAnswers?: Record<string, string>,
  fillOptions?: FormFillOptions
): Promise<{ actions: FillAction[]; missingRequired: MissingRequiredField[] }> {
  const profileSlice =
    kind === "financial"
      ? {
          employeeCount: profile.employeeCount,
          annualRevenue: profile.annualRevenue,
          previousGrants: profile.previousGrants,
          fundingMin: profile.fundingMin,
          fundingMax: profile.fundingMax,
          fundingPurposes: profile.fundingPurposes,
          fundingDetails: profile.fundingDetails,
          coFundingAvailable: profile.coFundingAvailable,
          matchFundingDetails: profile.matchFundingDetails,
        }
      : {
          businessName: profile.businessName,
          registrationNumber: profile.registrationNumber,
          location: profile.location,
          sector: profile.sector,
          missionStatement: profile.missionStatement,
          description: profile.description,
          primaryContactName: profile.primaryContactName,
          primaryContactEmail: profile.primaryContactEmail,
          primaryContactPhone: profile.primaryContactPhone,
          directorNames: profile.directorNames,
          directorProfiles: profile.directorProfiles,
          teamMembers: profile.teamMembers,
          projectTitle: profile.projectTitle,
          projectSummary: profile.projectSummary,
          problemStatement: profile.problemStatement,
          proposedSolution: profile.proposedSolution,
          projectObjectives: profile.projectObjectives,
          expectedOutcomes: profile.expectedOutcomes,
          beneficiaryGroups: profile.beneficiaryGroups,
          partnerOrganisations: profile.partnerOrganisations,
          collaborationDetails: profile.collaborationDetails,
          fundingPurposes: profile.fundingPurposes,
          fundingDetails: profile.fundingDetails,
        };

  const richContext = buildRichProfileContext(profile);

  const grantSection = fillOptions?.grantContext
    ? (() => {
        const g = fillOptions.grantContext;
        return `\nGrant context (adapt your writing to match this grant's focus and language):\nGrant: ${g.name}. Funder: ${g.funder}.\n${g.eligibility ? `Eligibility: ${g.eligibility.slice(0, 1500)}\n` : ""}${g.description ? `Description: ${g.description.slice(0, 1500)}\n` : ""}${g.objectives ? `Objectives: ${String(g.objectives).slice(0, 1000)}\n` : ""}`;
      })()
    : "";

  const focusDirective = fillOptions?.focusNotes
    ? `\nAPPLICANT'S FOCUS DIRECTIVE (emphasise these aspects for this grant):\n${fillOptions.focusNotes}\n`
    : "";

  const prompt = `You are an expert grant writer mapping business profile data to a grant application form.
${grantSection}${focusDirective}
Form fields (use name or id for selector, e.g. input[name="company_name"] or #company_name). Each field may include:
- maxLength: maximum characters allowed (you MUST not exceed this).
- instruction: helper text that may specify word/character limits (e.g. "Max 500 words", "200 characters max"). You MUST stay within these limits.
- required: if true, the field is mandatory.

${JSON.stringify(fields, null, 2)}

Core profile data (${kind}; use alongside rich profile sections):
${JSON.stringify(profileSlice, null, 2)}
${richContext}
Return a single JSON object with two keys:
1. "actions": array of fill actions. Each: { "selector": "css selector", "value": "string", "type": "fill" | "select" | "check" | "choose_radio" | "choose_checkbox" | "rich_text" | "autocomplete" | "date" | "range" }.
   - Use "select" for dropdowns, "fill" for text/number/email/url, "choose_radio" for radio groups, "choose_checkbox" for checkbox groups, and "check" only for a single boolean checkbox.
   - Use "rich_text" for contenteditable editors. Use "autocomplete" when typing should trigger a suggestion list. Use "date" for date inputs and ISO-style dates when known.
   - For radio/checkbox groups, set "selector" to the group selector in the field metadata and "value" to the visible option label to choose.
   - Answer every visible application field you can answer safely from the profile, grant context, learned answers, or user-provided answers. For empty optional values omit the action.
   - Answer eligibility declarations truthfully from the profile. If the answer is unknown or would make an unsupported eligibility claim, list it in missingRequired instead of guessing.
   - Write TAILORED values that connect the applicant's strengths to what this specific grant/funder values. Use concrete numbers and achievements from the rich profile sections. Do not write generic boilerplate.
   - You MUST respect each field's maxLength and any word/character limits in instruction.
2. "missingRequired": array of form fields that appear REQUIRED (required: true, or label suggests mandatory) but for which the profile has no value. Each: { "selector": "css selector", "label": "field label for user", "hint": "short hint what to enter" }.
   - Only include fields that are clearly required and missing from profile. Use empty array if none.
${userAnswers && Object.keys(userAnswers).length > 0 ? `\nThe user has already provided these values for previously missing fields (use these to fill the form; do not list them in missingRequired):\n${JSON.stringify(userAnswers, null, 2)}` : ""}

Return ONLY the JSON object, no markdown.`;

  const res = await getAnthropic().messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
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
        type: ((a as FillAction).type as FillAction["type"]) || "fill",
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
    if (f.selector) map.set(f.selector.toLowerCase(), f);
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
    const res = await getAnthropic().messages.create({
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

  return getAnthropic().messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  }).then((res: { content?: Array<{ type: string; text?: string }> }) => {
    const text =
      res.content?.[0]?.type === "text" ? (res.content[0].text ?? "") : "";
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
    const res = await getAnthropic().messages.create({
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
