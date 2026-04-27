import Anthropic from "@anthropic-ai/sdk";
import type { Page } from "playwright";
import { getFormFields, type FormFieldInfo } from "./browser.js";
import type { GrantContext } from "./form-mapping.js";
import type { GrantFormField, GrantFormSchema, GrantInputType } from "./types/grant-form-schema.js";

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("Missing env var: ANTHROPIC_API_KEY");
    _anthropic = new Anthropic({ apiKey: key });
  }
  return _anthropic;
}

function snakeCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "field";
}

function mapInputType(field: FormFieldInfo): GrantInputType {
  const type = (field.type || "").toLowerCase();
  if (type === "textarea") return "textarea";
  if (type === "contenteditable") return "rich_text";
  if (type === "radio_group") return "radio";
  if (type === "checkbox_group") return "checkbox";
  if (type === "select" || type === "select-one" || type === "select-multiple") return "select";
  if (["email", "number", "tel", "url", "date", "range", "hidden", "text"].includes(type)) {
    return type as GrantInputType;
  }
  return "text";
}

function inferValueSource(label: string, type: GrantInputType): GrantFormField["value_source"] {
  const l = label.toLowerCase();
  if (type === "file") return "uploaded_document";
  if (/\b(declaration|confirm|certify|terms|consent|gdpr|accuracy|fraud|submit)\b/.test(l)) return "human_review";
  if (/\b(project|summary|describe|problem|solution|outcome|impact|beneficiar|risk|milestone|deliverable|why|unique|sustainability)\b/.test(l)) return "generated_answer";
  return "user_profile";
}

function requiresHumanReview(label: string): boolean {
  return /\b(declaration|confirm|certify|terms|conditions|consent|gdpr|accuracy|fraud|submit|signature)\b/i.test(label);
}

async function extractPageSignals(page: Page): Promise<{
  buttons: { label: string; selector?: string; type?: string; risk?: string }[];
  attachments: GrantFormField[];
  risks: string[];
  captchaDetected: boolean;
  otpRequired: boolean;
  requiresLogin: boolean;
  multiStep: boolean;
  language?: string;
}> {
  return page.evaluate(() => {
    const body = document.body?.innerText?.toLowerCase() ?? "";
    type DetectedButton = { label: string; selector?: string; type?: string; risk?: string };
    const buttons = Array.from(document.querySelectorAll<HTMLElement>('button, input[type="submit"], input[type="button"], a[href], [role="button"]'))
      .reduce<DetectedButton[]>((acc, el, idx) => {
        const label = (el.textContent || (el as HTMLInputElement).value || "").trim().replace(/\s+/g, " ").slice(0, 120);
        if (!label) return acc;
        const id = el.id ? `#${CSS.escape(el.id)}` : undefined;
        const name = (el as HTMLInputElement).name ? `${el.tagName.toLowerCase()}[name="${CSS.escape((el as HTMLInputElement).name)}"]` : undefined;
        const risk = /\b(submit|send application|complete application|finalise|confirm submission)\b/i.test(label) ? "final_submit" : undefined;
        acc.push({ label, selector: id ?? name ?? `${el.tagName.toLowerCase()}:nth-of-type(${idx + 1})`, type: el.tagName.toLowerCase(), risk });
        return acc;
      }, []);

    const attachments = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]')).map((el, idx) => {
      const label = el.labels?.[0]?.textContent?.trim() || el.name || el.id || `File upload ${idx + 1}`;
      const accepted = (el.accept || "").split(",").map((s) => s.trim()).filter(Boolean);
      return {
        field_id: label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `file_${idx + 1}`,
        label,
        input_type: "file" as const,
        html_input_type: "file",
        required: el.required,
        options: [],
        value_source: "uploaded_document" as const,
        confidence: 0.9,
        requires_human_review: false,
        recommended_selector: el.id ? `#${CSS.escape(el.id)}` : el.name ? `input[name="${CSS.escape(el.name)}"]` : `input[type="file"]:nth-of-type(${idx + 1})`,
        validation: { accepted_file_types: accepted },
      };
    });

    const captchaDetected = /(recaptcha|hcaptcha|captcha|i am not a robot)/i.test(document.documentElement.innerHTML);
    const otpRequired = /\b(otp|one-time password|verification code|security code|check your email|verify your email)\b/i.test(body);
    const requiresLogin = document.querySelector('input[type="password"]') != null || /\b(sign in|log in|login|create account)\b/i.test(body);
    const multiStep = buttons.some((b) => /\b(next|continue|save and continue|previous|back)\b/i.test(b.label));
    const risks = [
      captchaDetected ? "captcha_detected" : "",
      otpRequired ? "otp_required" : "",
      requiresLogin ? "login_required" : "",
      buttons.some((b) => b.risk === "final_submit") ? "final_submit_button_detected" : "",
    ].filter(Boolean);
    return {
      buttons,
      attachments,
      risks,
      captchaDetected,
      otpRequired,
      requiresLogin,
      multiStep,
      language: document.documentElement.lang || undefined,
    };
  });
}

function buildHeuristicSchema(
  pageUrl: string,
  fields: FormFieldInfo[],
  signals: Awaited<ReturnType<typeof extractPageSignals>>,
  grantContext?: GrantContext
): GrantFormSchema {
  const schemaFields: GrantFormField[] = fields.map((field, index) => {
    const inputType = mapInputType(field);
    const label = field.label || field.placeholder || field.name || `Field ${index + 1}`;
    return {
      field_id: snakeCase(label || field.name),
      label,
      aliases: [field.name, field.placeholder].filter(Boolean),
      input_type: inputType,
      html_input_type: field.type,
      required: field.required === true,
      options: field.options?.map((o) => o.label || o.value).filter(Boolean),
      placeholder: field.placeholder,
      help_text: field.instruction,
      value_source: inferValueSource(label, inputType),
      confidence: field.label ? 0.8 : 0.55,
      requires_human_review: requiresHumanReview(label),
      recommended_selector: field.selector ?? (field.id ? `#${field.id}` : field.name ? `[name="${field.name}"]` : undefined),
      playwright_selector_candidates: {
        by_label: field.label || undefined,
        by_placeholder: field.placeholder || undefined,
        by_name: field.name || undefined,
        by_id: field.id ?? undefined,
        by_css: field.selector,
      },
      validation: {
        max_length: field.maxLength ?? null,
        accepted_file_types: [],
      },
      conditional_logic: { is_conditional: false },
      notes: field.instruction,
    };
  });

  return {
    form_metadata: {
      url: pageUrl,
      grant_name: grantContext?.name,
      provider: grantContext?.funder,
      requires_login: signals.requiresLogin,
      multi_step: signals.multiStep,
      captcha_detected: signals.captchaDetected,
      otp_required: signals.otpRequired,
      language: signals.language,
      detected_pages: [pageUrl],
    },
    sections: [
      {
        section_id: "detected_fields",
        section_title: "Detected Fields",
        page_index: 1,
        order: 1,
        fields: schemaFields,
      },
    ],
    attachments: signals.attachments,
    buttons: signals.buttons,
    automation_risks: signals.risks,
    recommended_next_action: signals.risks.length > 0 ? "human_review" : "fill_form",
  };
}

function sanitizeSchema(schema: GrantFormSchema, fallback: GrantFormSchema): GrantFormSchema {
  if (!schema || !Array.isArray(schema.sections)) return fallback;
  return {
    ...fallback,
    ...schema,
    form_metadata: { ...fallback.form_metadata, ...(schema.form_metadata ?? {}) },
    sections: schema.sections.length > 0 ? schema.sections : fallback.sections,
    attachments: schema.attachments ?? fallback.attachments,
    buttons: schema.buttons ?? fallback.buttons,
    automation_risks: [...new Set([...(fallback.automation_risks ?? []), ...(schema.automation_risks ?? [])])],
  };
}

export async function extractGrantFormSchema(page: Page, grantContext?: GrantContext): Promise<GrantFormSchema> {
  const [fields, signals] = await Promise.all([getFormFields(page), extractPageSignals(page)]);
  const fallback = buildHeuristicSchema(page.url(), fields, signals, grantContext);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey?.trim()) return fallback;

  let screenshotBase64: string | null = null;
  try {
    screenshotBase64 = (await page.screenshot({ type: "png", fullPage: false })).toString("base64");
  } catch {
    screenshotBase64 = null;
  }

  const prompt = `You are Grant Form Intelligence Agent.

Inspect this grant application page and convert it into a structured JSON schema that can later be filled by Playwright. Do not submit the form. Output valid JSON only.

Grant context:
${grantContext ? JSON.stringify(grantContext, null, 2) : "Unknown"}

DOM field metadata:
${JSON.stringify(fields, null, 2)}

Detected page signals:
${JSON.stringify(signals, null, 2)}

For every field include: field_id, label, aliases, input_type, html_input_type, required, options, placeholder, help_text, validation, conditional_logic, playwright_selector_candidates, recommended_selector, value_source, confidence, requires_human_review, notes.

Rules:
- Prefer selectors in this order: by_label, by_role, by_placeholder, by_name, by_id, by_css.
- Never invent fields not present in the DOM metadata or visible screenshot.
- Mark declarations, consent, legal confirmation, accuracy statements, and final submission controls as requires_human_review=true.
- Mark narrative fields as generated_answer, company/contact/finance facts as user_profile, evidence uploads as uploaded_document.
- If CAPTCHA/OTP/login/final submit is detected, include it in automation_risks and form_metadata flags.
- Output this exact top-level shape: {"form_metadata": {...}, "sections": [], "attachments": [], "buttons": [], "automation_risks": [], "recommended_next_action": ""}.`;

  try {
    const content = screenshotBase64
      ? [
          { type: "image" as const, source: { type: "base64" as const, media_type: "image/png" as const, data: screenshotBase64 } },
          { type: "text" as const, text: prompt },
        ]
      : prompt;
    const res = await getAnthropic().messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [{ role: "user", content }],
    });
    const text = res.content?.[0]?.type === "text" ? res.content[0].text : "";
    const json = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
    return sanitizeSchema(JSON.parse(json) as GrantFormSchema, fallback);
  } catch (err) {
    console.warn("[form-schema] Claude schema extraction failed; using heuristic schema", err);
    return fallback;
  }
}

export function schemaRequiresHumanReview(schema: GrantFormSchema): boolean {
  const hasHumanField = schema.sections.some((section) =>
    section.fields.some((field) => field.requires_human_review)
  );
  const risks = schema.automation_risks ?? [];
  return hasHumanField || risks.some((risk) => /captcha|otp|declaration|final_submit|login/i.test(risk));
}
