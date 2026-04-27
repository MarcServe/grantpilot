import Anthropic from "@anthropic-ai/sdk";
import type { Page } from "playwright";
import { analyzeFormFields, detectPageSituation, type PageSituation } from "./page-situation.js";

export type FormPlatform =
  | "office_forms"
  | "google_forms"
  | "typeform"
  | "jotform"
  | "airtable"
  | "generic";

export interface NavigationEvent {
  step: string;
  detail: string;
  success: boolean;
  metadata?: Record<string, unknown>;
}

export interface NavigationDecision {
  action: "click" | "type" | "wait" | "stop";
  target?: {
    text?: string;
    role?: "button" | "link" | "input";
    selector?: string;
  };
  reason: string;
  confidence: number;
  blockingReason?: "login_required" | "captcha" | "otp" | "payment" | "final_submit" | "unknown";
  alternativeTargets?: Array<{ text?: string; role?: string; selector?: string }>;
}

export interface NavigationAgentResult {
  success: boolean;
  notes: string;
  situation?: PageSituation;
  needsDirectUrl?: boolean;
  events: NavigationEvent[];
}

const MAX_AGENT_STEPS = 8;
const MIN_AI_CONFIDENCE = 0.6;

const ENTRY_BUTTON_PATTERNS = [
  /apply/i,
  /apply now/i,
  /apply here/i,
  /start/i,
  /start now/i,
  /start application/i,
  /begin/i,
  /begin application/i,
  /continue/i,
  /register to apply/i,
  /submit application/i,
  /empezar/i,
  /empezar ahora/i,
  /comenzar/i,
  /iniciar/i,
  /siguiente/i,
  /continuar/i,
];

const BLOCKED_ACTIONS = [
  /delete/i,
  /cancel/i,
  /withdraw/i,
  /pay/i,
  /payment/i,
  /confirm payment/i,
  /final submit/i,
  /submit final/i,
  /send application/i,
  /submit application/i,
];

const PROGRESS_BUTTON_TEXT = /next|continue|siguiente|continuar|start now|start|begin|empezar|comenzar|iniciar/i;

function event(step: string, detail: string, success: boolean, metadata?: Record<string, unknown>): NavigationEvent {
  return { step, detail, success, ...(metadata ? { metadata } : {}) };
}

export function detectFormPlatform(url: string): FormPlatform {
  const u = url.toLowerCase();
  if (/forms\.office\.com|forms\.microsoft\.com/.test(u)) return "office_forms";
  if (/docs\.google\.com\/forms|forms\.gle/.test(u)) return "google_forms";
  if (/typeform\.com|form\.typeform\.com/.test(u)) return "typeform";
  if (/jotform\.com|form\.jotform\.com/.test(u)) return "jotform";
  if (/airtable\.com/.test(u)) return "airtable";
  return "generic";
}

function isSafeActionText(text: string): boolean {
  return !BLOCKED_ACTIONS.some((pattern) => pattern.test(text));
}

async function detectBlocking(page: Page): Promise<{
  blocked: boolean;
  reason?: NavigationDecision["blockingReason"];
  detail?: string;
}> {
  return page.evaluate(() => {
    const body = document.body?.innerText?.toLowerCase() ?? "";
    const html = document.documentElement?.innerHTML?.toLowerCase() ?? "";
    const hasCaptcha =
      /recaptcha|hcaptcha|captcha|i am not a robot/.test(html) ||
      document.querySelector('iframe[src*="captcha"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"]') != null;
    if (hasCaptcha) return { blocked: true, reason: "captcha" as const, detail: "CAPTCHA detected" };
    const hasPassword = document.querySelector('input[type="password"]') != null;
    if (hasPassword || /\b(sign in|log in|login)\b/.test(body)) {
      return { blocked: true, reason: "login_required" as const, detail: "Login required" };
    }
    if (/\b(otp|one-time password|verification code|security code|verify your email|check your inbox)\b/.test(body)) {
      return { blocked: true, reason: "otp" as const, detail: "OTP or verification required" };
    }
    if (/\b(payment|card number|checkout|pay now|confirm payment)\b/.test(body)) {
      return { blocked: true, reason: "payment" as const, detail: "Payment step detected" };
    }
    return { blocked: false };
  }).catch(() => ({ blocked: false }));
}

export async function isGrantFormPage(page: Page): Promise<{ isForm: boolean; detail: string; fieldCount: number }> {
  const platform = detectFormPlatform(page.url());
  const analysis = await analyzeFormFields(page).catch(() => ({ applicationFieldCount: 0, chromeFieldCount: 0, totalFields: 0 }));
  const signals = await page.evaluate(() => {
    const body = document.body?.innerText?.toLowerCase() ?? "";
    const buttons = Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"], input[type="button"], input[type="submit"]'));
    const hasQuestionText = /\?|required|question|respuesta|obligatoria|your answer|short answer|paragraph/.test(body);
    const hasNextOrSubmit = buttons.some((el) => {
      const text = `${el.textContent ?? ""} ${(el as HTMLInputElement).value ?? ""} ${el.getAttribute("aria-label") ?? ""}`.toLowerCase();
      return /\b(next|continue|submit|siguiente|continuar|enviar)\b/.test(text);
    });
    const visibleChoiceCount = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]'))
      .filter((input) => input.offsetParent != null).length;
    return { hasQuestionText, hasNextOrSubmit, visibleChoiceCount };
  }).catch(() => ({ hasQuestionText: false, hasNextOrSubmit: false, visibleChoiceCount: 0 }));

  const fieldCount = analysis.applicationFieldCount;
  const hostedWizard = platform !== "generic" && (fieldCount >= 1 || signals.visibleChoiceCount >= 1) && (signals.hasQuestionText || signals.hasNextOrSubmit);
  const genericForm = fieldCount >= 3 || (fieldCount >= 1 && signals.hasQuestionText && signals.hasNextOrSubmit);
  return {
    isForm: hostedWizard || genericForm,
    fieldCount,
    detail: `platform=${platform}, fields=${fieldCount}, choices=${signals.visibleChoiceCount}, questionText=${signals.hasQuestionText}, nextOrSubmit=${signals.hasNextOrSubmit}`,
  };
}

async function clickLocatorWithNavigation(page: Page, locator: ReturnType<Page["locator"]>): Promise<boolean> {
  const context = page.context();
  const newPagePromise = context.waitForEvent("page", { timeout: 5000 }).catch(() => null);
  await locator.click();
  const newPage = await newPagePromise;
  if (newPage) {
    await newPage.waitForLoadState("domcontentloaded").catch(() => {});
    const newUrl = newPage.url();
    if (newUrl && !/^about:blank/i.test(newUrl)) {
      await page.goto(newUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
    }
    await newPage.close().catch(() => {});
  } else {
    await Promise.race([
      page.waitForLoadState("domcontentloaded").catch(() => {}),
      page.waitForTimeout(2500),
    ]);
  }
  await page.waitForTimeout(1200);
  return true;
}

async function findAndClickEntryPoint(page: Page, events: NavigationEvent[]): Promise<boolean> {
  for (const pattern of ENTRY_BUTTON_PATTERNS) {
    for (const role of ["button", "link"] as const) {
      const locator = page.getByRole(role, { name: pattern }).first();
      const count = await locator.count().catch(() => 0);
      if (count <= 0) continue;
      const text = ((await locator.textContent().catch(() => "")) ?? "").trim() || String(pattern);
      if (!isSafeActionText(text)) {
        events.push(event("entry_safety", `Blocked unsafe ${role}: ${text}`, false, { text }));
        continue;
      }
      events.push(event("entry_search", `Found ${role}: ${text}`, true, { text, role }));
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      await clickLocatorWithNavigation(page, locator);
      events.push(event("entry_click", `Clicked ${role}: ${text}`, true, { text, role, url: page.url() }));
      return true;
    }
  }
  events.push(event("entry_search", "No deterministic entry button or link found", false));
  return false;
}

async function clickSafeProgressControl(page: Page, events: NavigationEvent[]): Promise<boolean> {
  const candidates = [
    page.locator("button", { hasText: PROGRESS_BUTTON_TEXT }),
    page.locator('[role="button"]', { hasText: PROGRESS_BUTTON_TEXT }),
    page.locator("a[href]", { hasText: PROGRESS_BUTTON_TEXT }),
  ];
  for (const loc of candidates) {
    const count = await loc.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const node = loc.nth(i);
      if (!(await node.isVisible().catch(() => false))) continue;
      const text = ((await node.textContent().catch(() => "")) ?? "").trim();
      if (!isSafeActionText(text)) {
        events.push(event("progress_safety", `Blocked unsafe progress control: ${text}`, false, { text }));
        continue;
      }
      await node.scrollIntoViewIfNeeded().catch(() => {});
      await clickLocatorWithNavigation(page, node);
      events.push(event("progress_click", `Clicked progress control: ${text || "unlabelled"}`, true, { text, url: page.url() }));
      return true;
    }
  }

  const clicked = await page.evaluate((patternSource) => {
    const pattern = new RegExp(patternSource, "i");
    const candidates = Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"], a[href], input[type="button"], input[type="submit"]'));
    const target = candidates.find((el) => {
      const text = `${el.textContent ?? ""} ${(el as HTMLInputElement).value ?? ""} ${el.getAttribute("aria-label") ?? ""}`;
      if (!pattern.test(text)) return false;
      if (/\b(delete|cancel|withdraw|pay|payment|final submit|submit application)\b/i.test(text)) return false;
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    });
    if (!target) return null;
    const text = `${target.textContent ?? ""} ${(target as HTMLInputElement).value ?? ""} ${target.getAttribute("aria-label") ?? ""}`.trim();
    target.scrollIntoView({ block: "center", inline: "center" });
    target.click();
    return text || "unlabelled";
  }, PROGRESS_BUTTON_TEXT.source).catch(() => null);
  if (clicked) {
    await Promise.race([
      page.waitForLoadState("domcontentloaded").catch(() => {}),
      page.waitForTimeout(2500),
    ]);
    events.push(event("progress_click", `Clicked progress control via DOM: ${clicked}`, true, { text: clicked, url: page.url() }));
    return true;
  }
  return false;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function executeDecision(page: Page, decision: NavigationDecision, events: NavigationEvent[]): Promise<boolean> {
  const text = decision.target?.text?.trim();
  const role = decision.target?.role;
  const selector = decision.target?.selector?.trim();
  const actionText = text || selector || "";
  if (!actionText || !isSafeActionText(actionText)) {
    events.push(event("ai_safety", `Blocked unsafe or empty AI target: ${actionText || "empty"}`, false, { decision }));
    return false;
  }
  if (selector) {
    const locator = page.locator(selector).first();
    if ((await locator.count().catch(() => 0)) > 0) {
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      await clickLocatorWithNavigation(page, locator);
      events.push(event("ai_execute", `Clicked selector from Claude: ${selector}`, true, { selector, reason: decision.reason }));
      return true;
    }
  }
  if (text && (role === "button" || role === "link")) {
    const locator = page.getByRole(role, { name: new RegExp(escapeRegExp(text), "i") }).first();
    if ((await locator.count().catch(() => 0)) > 0) {
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      await clickLocatorWithNavigation(page, locator);
      events.push(event("ai_execute", `Clicked ${role} from Claude: ${text}`, true, { text, role, reason: decision.reason }));
      return true;
    }
  }
  events.push(event("ai_execute", `Could not find Claude target: ${actionText}`, false, { decision }));
  return false;
}

async function getNavigationDecision(page: Page, platform: FormPlatform): Promise<NavigationDecision | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey?.trim()) return null;
  let screenshotBase64: string;
  try {
    screenshotBase64 = (await page.screenshot({ type: "png", fullPage: false })).toString("base64");
  } catch {
    return null;
  }

  const prompt = `You are a Web Navigation Agent helping automate a grant application.

Current URL: ${page.url()}
Detected platform: ${platform}

Your task: identify the next safe action required to reach the application form.

Look for:
- Apply buttons
- Start application buttons
- Begin/Continue buttons
- Register/Login prompts
- Links leading to application portals

Return ONLY valid JSON:
{
  "action": "click | type | wait | stop",
  "target": {
    "text": "visible text on button/link",
    "role": "button | link | input",
    "selector": "optional CSS selector if obvious"
  },
  "reason": "why this action leads toward the form",
  "confidence": 0.0,
  "blockingReason": "login_required | captcha | otp | payment | final_submit | unknown",
  "alternativeTargets": []
}

Rules:
- Prioritise visible Apply, Start, Begin, Continue, Empezar, Comenzar, Iniciar, Siguiente, or Continuar actions.
- If login, CAPTCHA, OTP, payment, or final submission is required, return action="stop" with blockingReason.
- If already on a form/question page, return action="stop" with reason "form_loaded".
- Do NOT hallucinate elements not visible.
- Do NOT choose delete, cancel, withdraw, payment, or final submit actions.
- Keep it deterministic.`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 600,
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
    const json = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
    return JSON.parse(json) as NavigationDecision;
  } catch {
    return null;
  }
}

async function fallbackNavigation(page: Page, events: NavigationEvent[]): Promise<boolean> {
  const base = new URL(page.url());
  const paths = ["/apply", "/application", "/apply-now", "/start", "/form"];
  for (const path of paths) {
    try {
      const target = new URL(path, base).toString();
      events.push(event("fallback_url", `Trying ${target}`, true, { target }));
      await page.goto(target, { waitUntil: "domcontentloaded", timeout: 20_000 });
      const form = await isGrantFormPage(page);
      events.push(event("fallback_form_check", form.detail, form.isForm, { target }));
      if (form.isForm) return true;
    } catch (err) {
      events.push(event("fallback_url", `Failed fallback path ${path}`, false, { error: err instanceof Error ? err.message : String(err) }));
    }
  }
  return false;
}

export async function navigateWithAgent(page: Page): Promise<NavigationAgentResult> {
  const events: NavigationEvent[] = [];
  const platform = detectFormPlatform(page.url());
  let inFormFlow = false;
  events.push(event("platform_detect", `Detected platform: ${platform}`, true, { platform, url: page.url() }));

  for (let step = 0; step < MAX_AGENT_STEPS; step++) {
    events.push(event("agent_step", `Analyzing page ${step + 1}/${MAX_AGENT_STEPS}`, true, { url: page.url() }));

    const blocker = await detectBlocking(page);
    if (blocker.blocked) {
      events.push(event("blocker_detect", blocker.detail ?? blocker.reason ?? "Blocked", false, { reason: blocker.reason }));
      return { success: false, notes: blocker.detail ?? "Navigation requires human intervention", situation: blocker.reason === "login_required" ? "login_required" : "needs_verification", events };
    }

    const form = await isGrantFormPage(page);
    const formIntroPage =
      platform !== "generic" &&
      form.fieldCount === 0 &&
      form.detail.includes("questionText=true") &&
      form.detail.includes("nextOrSubmit=true");
    events.push(event(
      "form_check",
      form.isForm ? form.detail : `Not a fillable form yet (${form.detail})`,
      form.isForm || formIntroPage || step < MAX_AGENT_STEPS - 1,
      { fieldCount: form.fieldCount, formIntroPage }
    ));
    if (form.isForm) {
      return { success: true, notes: `Form loaded (${form.detail})`, situation: "application_form", events };
    }
    if (inFormFlow || formIntroPage) {
      inFormFlow = true;
      events.push(event("form_intro_page", `Inside hosted form flow (${form.detail})`, true, { platform }));
      const progressed = await clickSafeProgressControl(page, events);
      if (progressed) continue;
    }

    const situation = await detectPageSituation(page).catch(() => ({ situation: "unknown" as PageSituation, needsDirectUrl: true }));
    events.push(event("situation_detect", `Detected situation: ${situation.situation}`, situation.situation !== "unknown", { situation }));
    if (situation.situation === "login_required" || situation.situation === "needs_verification") {
      return { success: false, notes: `Navigation stopped: ${situation.situation}`, situation: situation.situation, events };
    }
    if (situation.situation === "application_form") {
      return { success: true, notes: "Application form detected by page situation", situation: "application_form", events };
    }

    if (!inFormFlow) {
      const deterministicClicked = await findAndClickEntryPoint(page, events);
      if (deterministicClicked) {
        inFormFlow = true;
        continue;
      }
    } else {
      events.push(event("entry_search", "Skipped entry search because already inside form flow", true, { inFormFlow }));
    }

    if (platform !== "generic" && !form.isForm && form.detail.includes("nextOrSubmit=true")) {
      const progressed = await clickSafeProgressControl(page, events);
      if (progressed) continue;
    }

    const decision = await getNavigationDecision(page, platform);
    if (!decision) {
      events.push(event("ai_decision", "Claude navigation decision unavailable", false));
      break;
    }
    events.push(event("ai_decision", decision.reason, decision.confidence >= MIN_AI_CONFIDENCE, { decision }));
    if (decision.action === "stop") {
      if (decision.blockingReason) {
        return { success: false, notes: `Navigation stopped: ${decision.blockingReason}`, situation: decision.blockingReason === "login_required" ? "login_required" : "unknown", needsDirectUrl: decision.blockingReason === "unknown", events };
      }
      const formAfterStop = await isGrantFormPage(page);
      if (!formAfterStop.isForm && /form_loaded/i.test(decision.reason) && formAfterStop.detail.includes("nextOrSubmit=true")) {
        const progressed = await clickSafeProgressControl(page, events);
        if (progressed) continue;
      }
      return { success: formAfterStop.isForm, notes: formAfterStop.isForm ? `Form loaded (${formAfterStop.detail})` : decision.reason, situation: formAfterStop.isForm ? "application_form" : "unknown", needsDirectUrl: !formAfterStop.isForm, events };
    }
    if (decision.confidence < MIN_AI_CONFIDENCE) break;
    const executed = await executeDecision(page, decision, events);
    if (executed && platform !== "generic") inFormFlow = true;
    if (!executed) break;
  }

  if (platform === "generic") {
    const fallback = await fallbackNavigation(page, events);
    if (fallback) {
      return { success: true, notes: "Form loaded via fallback URL strategy", situation: "application_form", events };
    }
  }

  return {
    success: false,
    notes: "Could not locate form entry point after deterministic, Claude, and fallback navigation attempts.",
    situation: "unknown",
    needsDirectUrl: true,
    events,
  };
}
