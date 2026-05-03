/**
 * Detect page situation after opening a grant URL so we can block fill steps
 * when the user must sign in, use a direct application link, or complete verification.
 *
 * Two-layer detection: vision (screenshot + Claude) first, DOM heuristics fallback.
 * Also provides form-field analysis to distinguish real application fields from site chrome.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Page } from "playwright";

export type PageSituation =
  | "login_required"
  | "competition_list"
  | "application_form"
  | "info_page_with_apply"
  | "needs_verification"
  | "page_not_found"
  | "portal_dashboard"
  | "portal_section_list"
  | "portal_terms"
  | "unknown";

export interface PageSituationResult {
  situation: PageSituation;
  /** Set when situation is competition_list or page_not_found; app can prompt user to set direct URL. */
  needsDirectUrl?: boolean;
  /** CSS selector for an "Apply" / "Start application" button when situation is info_page_with_apply. */
  applyButtonSelector?: string;
  /** Confidence: how sure are we this is the right classification (0-1). */
  confidence?: number;
}

/** A detected section in a multi-section application wizard. */
export interface DetectedSection {
  label: string;
  selector: string;
  completed: boolean;
}

export interface NavigationHints {
  /** Main document response status returned by Playwright page.goto. */
  status?: number;
  /** Final URL after redirects. */
  finalUrl?: string;
}

const VALID_SITUATIONS: PageSituation[] = [
  "login_required",
  "competition_list",
  "application_form",
  "info_page_with_apply",
  "needs_verification",
  "page_not_found",
  "portal_dashboard",
  "portal_section_list",
  "portal_terms",
  "unknown",
];

/**
 * Vision-based detection: screenshot + Claude to classify page.
 * Returns null on API/parse failure so caller can fall back to heuristics.
 */
async function detectPageSituationWithVision(page: Page): Promise<PageSituationResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey?.trim()) return null;
  let screenshotBase64: string;
  try {
    const buf = await page.screenshot({ type: "png", fullPage: false });
    screenshotBase64 = buf.toString("base64");
  } catch {
    return null;
  }
  const anthropic = new Anthropic({ apiKey });
  const pageUrl = page.url();
  const prompt = `Look at this screenshot of a webpage (URL: ${pageUrl}).

Classify the page as exactly one of:
- login_required: sign-in / log-in form, password field, or gateway requiring authentication
- needs_verification: email verification, create account, confirm email, check inbox
- competition_list: list of schemes, competitions, or funding opportunities (NOT a single grant's application form)
- info_page_with_apply: an information/description page about a specific grant that has an "Apply", "Start application", "Apply now", "Begin application", or similar button/link to start the actual application. This is NOT the form itself — it describes the grant and has a CTA to begin.
- application_form: actual grant application form with multiple fillable fields (text inputs, textareas, dropdowns) that ask for applicant details like company name, project description, budget, etc. Must have at least 3 substantive form fields (not just search/filter/login).
- portal_dashboard: a portal home/dashboard page (e.g. Innovate UK dashboard, Find a Grant applicant dashboard) showing existing applications or "Start new application" option
- portal_section_list: a multi-section application overview with a list of sections/tasks to complete (e.g. sidebar navigation with section names and completion status)
- portal_terms: terms and conditions, cookie consent, or legal agreement page that must be accepted before proceeding
- page_not_found: 404 error, "we can't find that page", "page not found", broken/missing page
- unknown: none of the above or unclear

IMPORTANT distinctions:
- A page with just a search bar, filters, or cookie consent is NOT an application_form
- A grant info page with an "Apply" button is info_page_with_apply, not application_form
- Only classify as application_form if you can see actual form fields asking for applicant information
- A portal dashboard with a list of in-progress applications is portal_dashboard, not application_form
- A page showing application sections/tasks to complete is portal_section_list, not application_form

If the page is info_page_with_apply, provide the best CSS selector for the Apply/Start button.
If the page is competition_list, page_not_found, or unknown, set needsDirectUrl to true.

Return ONLY a JSON object: {"situation":"...","needsDirectUrl":false,"applyButtonSelector":null,"confidence":0.9}. No markdown.`;

  try {
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
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
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : text;
    const parsed = JSON.parse(jsonStr) as {
      situation?: string;
      needsDirectUrl?: boolean;
      applyButtonSelector?: string | null;
      confidence?: number;
    };
    const situation = parsed.situation as string | undefined;
    if (!situation || !VALID_SITUATIONS.includes(situation as PageSituation)) {
      return null;
    }
    return {
      situation: situation as PageSituation,
      ...(parsed.needsDirectUrl === true ? { needsDirectUrl: true } : {}),
      ...(parsed.applyButtonSelector ? { applyButtonSelector: parsed.applyButtonSelector } : {}),
      ...(typeof parsed.confidence === "number" ? { confidence: parsed.confidence } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Analyze form fields on the page and determine if they are genuine application fields.
 * Returns { applicationFieldCount, chromeFieldCount, totalFields }.
 */
export async function analyzeFormFields(page: Page): Promise<{
  applicationFieldCount: number;
  chromeFieldCount: number;
  totalFields: number;
}> {
  const analysis = await page.evaluate(() => {
    const inputs = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="password"]):not([type="file"]), textarea, select'
    );
    let appFields = 0;
    let chromeFields = 0;
    const chromeNames = /^(search|q|query|s|keyword|filter|sort|lang|language|locale|cookie|consent|newsletter|subscribe|email_subscribe|signup_email|mc_email)$/i;
    const chromeLabels = /\b(search|filter|sort by|language|cookie|newsletter|subscribe|sign up for)\b/i;

    inputs.forEach((el) => {
      const name = ((el as HTMLInputElement).name || (el as HTMLInputElement).id || "").toLowerCase();
      const type = ((el as HTMLInputElement).type || "").toLowerCase();
      let label = "";
      const forId = (el as HTMLInputElement).id;
      if (forId) {
        const labelEl = document.querySelector(`label[for="${forId}"]`);
        if (labelEl) label = (labelEl as HTMLLabelElement).textContent?.trim().toLowerCase() ?? "";
      }
      if (!label) {
        const parent = (el as HTMLElement).closest("label");
        if (parent) label = parent.textContent?.trim().toLowerCase() ?? "";
      }
      const placeholder = ((el as HTMLInputElement).placeholder ?? "").toLowerCase();

      if (
        chromeNames.test(name) ||
        chromeLabels.test(label) ||
        chromeLabels.test(placeholder) ||
        type === "search"
      ) {
        chromeFields++;
      } else {
        appFields++;
      }
    });

    const choiceGroups = new Set<string>();
    document.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]').forEach((input) => {
      const group = input.name || input.closest("fieldset")?.textContent?.trim() || input.id || input.value || "choice";
      choiceGroups.add(group);
    });
    appFields += choiceGroups.size;

    return { applicationFieldCount: appFields, chromeFieldCount: chromeFields, totalFields: appFields + chromeFields };
  });
  return analysis;
}

/**
 * DOM heuristic detection with field-aware analysis.
 */
function detectPageSituationHeuristic(raw: {
  situation?: string;
  needsDirectUrl?: boolean;
  applyButtonSelector?: string | null;
}): PageSituationResult {
  const situation = (raw?.situation ?? "unknown") as PageSituation;
  const needsDirectUrl = raw?.needsDirectUrl === true;
  return {
    situation: VALID_SITUATIONS.includes(situation) ? situation : "unknown",
    ...(needsDirectUrl ? { needsDirectUrl: true } : {}),
    ...(raw?.applyButtonSelector ? { applyButtonSelector: raw.applyButtonSelector } : {}),
  };
}

/**
 * Detect page situation: vision-first, then fall back to DOM heuristics.
 * Enhanced with field-aware analysis to prevent classifying non-form pages as forms.
 */
export async function detectPageSituation(page: Page, hints?: NavigationHints): Promise<PageSituationResult> {
  const navStatus = hints?.status;
  if (typeof navStatus === "number" && navStatus >= 400) {
    if (navStatus === 404 || navStatus === 410) {
      return { situation: "page_not_found", needsDirectUrl: true };
    }
    return { situation: "unknown", needsDirectUrl: true };
  }

  const finalUrl = (hints?.finalUrl ?? page.url() ?? "").toLowerCase();
  if (/(\/404(?:[/?#]|$))|(\/not-found(?:[/?#]|$))|[?&](?:error|status)=404/.test(finalUrl)) {
    return { situation: "page_not_found", needsDirectUrl: true };
  }

  if (/forms\.office\.com|forms\.microsoft\.com/i.test(finalUrl)) {
    const officeForms = await page.evaluate(() => {
      const body = document.body?.innerText?.toLowerCase() ?? "";
      const inputs = document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="password"]):not([type="file"]), textarea, select'
      );
      const choiceGroups = new Set<string>();
      document.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]').forEach((input) => {
        choiceGroups.add(input.name || input.id || input.value || "choice");
      });
      const buttons = Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"], input[type="button"], input[type="submit"]'));
      const startButton = buttons.find((el) => {
        const text = `${el.textContent ?? ""} ${(el as HTMLInputElement).value ?? ""} ${el.getAttribute("aria-label") ?? ""}`.toLowerCase();
        return /\b(start|begin|empezar|comenzar|iniciar)\b/.test(text);
      });
      const nextButton = buttons.find((el) => {
        const text = `${el.textContent ?? ""} ${(el as HTMLInputElement).value ?? ""} ${el.getAttribute("aria-label") ?? ""}`.toLowerCase();
        return /\b(next|continue|siguiente|continuar)\b/.test(text);
      });
      return {
        fieldCount: inputs.length + choiceGroups.size,
        hasStartButton: Boolean(startButton),
        hasNextButton: Boolean(nextButton),
        looksLikeOfficeForm: body.includes("application form") || body.includes("open call") || body.includes("microsoft forms") || body.includes("empezar"),
      };
    }).catch(() => null);
    if (officeForms?.fieldCount && officeForms.fieldCount >= 1) {
      return { situation: "application_form", confidence: 0.95 };
    }
    if (officeForms?.hasStartButton || officeForms?.looksLikeOfficeForm || officeForms?.hasNextButton) {
      return { situation: "info_page_with_apply", confidence: 0.9 };
    }
    return { situation: "info_page_with_apply", confidence: 0.7 };
  }

  if (/airtable\.com|tally\.so|typeform\.com|jotform\.com|formstack\.com|formsite\.com|cognitoforms\.com|form\.asana\.com|forms\.gle/i.test(finalUrl)) {
    const hostedForm = await page.evaluate(() => {
      const visible = (el: Element) => {
        const html = el as HTMLElement;
        const style = window.getComputedStyle(html);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
        const rect = html.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const captchaOrSystem = (el: Element) => {
        const input = el as HTMLInputElement;
        const text = `${input.name ?? ""} ${input.id ?? ""} ${input.getAttribute("aria-label") ?? ""}`.toLowerCase();
        return /\b(g-recaptcha-response|h-captcha-response|cf-turnstile-response|captcha|csrf|authenticity_token)\b/.test(text);
      };
      const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="password"]):not([type="file"]), textarea, select'))
        .filter((el) => visible(el) && !captchaOrSystem(el));
      const choices = new Set<string>();
      document.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]').forEach((input) => {
        if (captchaOrSystem(input)) return;
        const label = input.closest("label")?.textContent?.trim() || input.name || input.id || input.value || "choice";
        choices.add(label);
      });
      const roleChoices = Array.from(document.querySelectorAll('[role="radio"], [role="checkbox"]')).filter((el) => visible(el) && !captchaOrSystem(el));
      const buttons = Array.from(document.querySelectorAll<HTMLElement>('button, input[type="submit"], [role="button"]'));
      const hasSubmit = buttons.some((el) => {
        const text = `${el.textContent ?? ""} ${(el as HTMLInputElement).value ?? ""} ${el.getAttribute("aria-label") ?? ""}`.toLowerCase();
        return /\b(submit|next|continue|start|begin)\b/.test(text);
      });
      return { fieldCount: inputs.length + choices.size + roleChoices.length, hasSubmit };
    }).catch(() => ({ fieldCount: 0, hasSubmit: false }));
    if (hostedForm.fieldCount >= 1 || hostedForm.hasSubmit) {
      return { situation: "application_form", confidence: 0.95 };
    }
  }

  const visionResult = await detectPageSituationWithVision(page);
  if (visionResult) return visionResult;

  const raw = await page.evaluate(() => {
    const body = document.body?.innerText?.toLowerCase() ?? "";
    const html = document.documentElement?.innerHTML?.toLowerCase() ?? "";

    const hasPassword = document.querySelector('input[type="password"]') != null;
    const loginPhrases = [
      "sign in", "log in", "login", "sign in to your account",
      "government gateway", "one login", "submit your details to sign in",
    ];
    const hasLoginPhrase = loginPhrases.some((p) => body.includes(p) || html.includes(p));
    if (hasPassword || (hasLoginPhrase && body.length < 8000)) {
      return { situation: "login_required" };
    }

    const verifyPhrases = [
      "verify your email", "confirm your email", "verify your e-mail",
      "create an account", "create your account", "register for an account",
      "check your inbox", "verification link", "confirm your email address",
    ];
    if (verifyPhrases.some((p) => body.includes(p) || html.includes(p))) {
      return { situation: "needs_verification" };
    }

    const notFoundPhrases = [
      "we can't find that page", "can't find that page", "page not found",
      "404", "page you're looking for can't be found", "doesn't exist",
      "not found", "this page doesn't exist",
    ];
    if (notFoundPhrases.some((p) => body.includes(p) || html.includes(p))) {
      return { situation: "page_not_found", needsDirectUrl: true };
    }

    // Analyze inputs — distinguish application fields from site chrome
    const inputs = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="password"]):not([type="file"]), textarea, select'
    );
    const chromeNames = /^(search|q|query|s|keyword|filter|sort|lang|language|locale|cookie|consent|newsletter|subscribe|email_subscribe|signup_email|mc_email)$/i;
    const chromeLabels = /\b(search|filter|sort by|language|cookie|newsletter|subscribe|sign up for)\b/i;
    let appFieldCount = 0;
    inputs.forEach((el) => {
      const name = ((el as HTMLInputElement).name || (el as HTMLInputElement).id || "").toLowerCase();
      const type = ((el as HTMLInputElement).type || "").toLowerCase();
      let label = "";
      const forId = (el as HTMLInputElement).id;
      if (forId) {
        const labelEl = document.querySelector(`label[for="${forId}"]`);
        if (labelEl) label = (labelEl as HTMLLabelElement).textContent?.trim().toLowerCase() ?? "";
      }
      if (!label) {
        const parent = (el as HTMLElement).closest("label");
        if (parent) label = parent.textContent?.trim().toLowerCase() ?? "";
      }
      const placeholder = ((el as HTMLInputElement).placeholder ?? "").toLowerCase();

      const isChrome =
        chromeNames.test(name) ||
        chromeLabels.test(label) ||
        chromeLabels.test(placeholder) ||
        type === "search";

      if (!isChrome) appFieldCount++;
    });
    const choiceGroups = new Set<string>();
    document.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]').forEach((input) => {
      choiceGroups.add(input.name || input.closest("fieldset")?.textContent?.trim() || input.id || input.value || "choice");
    });
    appFieldCount += choiceGroups.size;

    // Check for Apply/Start buttons on info pages
    const applyPatterns = /\b(apply\s*(now|here|online)?|start\s*(now|application|form)?|begin\s*(now|application|form)?|start\s*your\s*application|apply\s*for\s*(this|the)\s*(grant|fund|scheme|competition)|empezar\s*ahora|comenzar|iniciar|start)\b/i;
    const buttons = document.querySelectorAll('a[href], button, input[type="submit"], [role="button"]');
    let applyButtonSelector: string | null = null;
    buttons.forEach((el) => {
      if (applyButtonSelector) return;
      const text = (el.textContent?.trim() ?? "") + " " + ((el as HTMLInputElement).value ?? "");
      if (applyPatterns.test(text)) {
        const id = (el as HTMLElement).id;
        if (id) {
          applyButtonSelector = `#${id}`;
        } else {
          const tag = el.tagName.toLowerCase();
          const href = (el as HTMLAnchorElement).getAttribute("href");
          if (href && tag === "a") {
            applyButtonSelector = `a[href="${href}"]`;
          } else {
            const cls = (el as HTMLElement).className?.split(/\s+/).filter(c => c.length > 2).slice(0, 2).join(".");
            if (cls) applyButtonSelector = `${tag}.${cls}`;
          }
        }
      }
    });

    // If we found an Apply button and few application fields, it's an info page
    if (applyButtonSelector && appFieldCount < 3) {
      return { situation: "info_page_with_apply", applyButtonSelector };
    }

    // Genuine application form: 3+ non-chrome fields
    if (appFieldCount >= 3) {
      return { situation: "application_form" };
    }

    // Competition list / portal detection
    const listPhrases = [
      "find a grant", "browse competitions", "open competitions",
      "current competitions", "list of schemes", "funding opportunities",
      "apply for funding", "view all competitions", "search for funding",
    ];
    const hasListPhrase = listPhrases.some((p) => body.includes(p) || html.includes(p));
    const linkCount = document.querySelectorAll('a[href]').length;
    if (hasListPhrase && (appFieldCount <= 2 || linkCount > 8)) {
      return { situation: "competition_list", needsDirectUrl: true };
    }

    const links = Array.from(document.querySelectorAll('a[href]'));
    const hrefs = links.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? "").filter(Boolean);
    const pathLike = hrefs.filter((h) => h.startsWith("/") && h.length > 5).length;
    if (pathLike >= 5 && appFieldCount <= 2) {
      return { situation: "competition_list", needsDirectUrl: true };
    }

    // 2 app fields = borderline, ask for direct URL
    if (appFieldCount >= 2) {
      return { situation: "application_form" };
    }

    return { situation: "unknown", needsDirectUrl: true };
  });

  return detectPageSituationHeuristic(raw as { situation?: string; needsDirectUrl?: boolean; applyButtonSelector?: string | null });
}

/**
 * Quick re-check of page situation (lightweight, no vision).
 * Use between steps to catch unexpected login redirects or page changes.
 */
export async function quickPageCheck(page: Page): Promise<PageSituation> {
  const result = await page.evaluate(() => {
    const body = document.body?.innerText?.toLowerCase() ?? "";
    const hasPassword = document.querySelector('input[type="password"]') != null;
    const loginPhrases = ["sign in", "log in", "login", "sign in to your account"];
    if (hasPassword || loginPhrases.some((p) => body.includes(p))) {
      return "login_required";
    }
    const verifyPhrases = ["verify your email", "confirm your email", "create an account", "check your inbox"];
    if (verifyPhrases.some((p) => body.includes(p))) {
      return "needs_verification";
    }
    const notFoundPhrases = ["page not found", "404", "doesn't exist", "not found"];
    if (notFoundPhrases.some((p) => body.includes(p))) {
      return "page_not_found";
    }
    // Detect portal terms/conditions pages
    const termsPhrases = ["terms and conditions", "accept the terms", "i agree to the terms", "privacy policy"];
    if (termsPhrases.some((p) => body.includes(p)) && body.length < 10000) {
      const hasAcceptBtn = document.querySelector('button:has-text("Accept"), button:has-text("I agree"), a:has-text("Accept")');
      if (hasAcceptBtn) return "portal_terms";
    }
    return "application_form";
  });
  return result as PageSituation;
}

/**
 * Detect portal-specific page situations using URL patterns and known selectors.
 * Faster than vision — should be checked first for known portals.
 */
export async function detectPortalPageSituation(
  page: Page,
  portalId: string
): Promise<PageSituationResult | null> {
  const url = page.url().toLowerCase();

  // IFS-specific patterns
  if (portalId === "innovate-uk-ifs") {
    if (url.includes("/idp/login") || url.includes("/idp/profile")) {
      return { situation: "login_required" };
    }
    // Competition landing (overview) — "Start new application" / sign-in; not a login form yet
    if (url.includes("/competition/") && url.includes("/overview")) {
      return { situation: "info_page_with_apply" };
    }
    if (url.includes("/applicant/dashboard") || url.includes("/dashboard")) {
      return { situation: "portal_dashboard" };
    }
    if (url.includes("/application/") && url.includes("/summary")) {
      return { situation: "portal_section_list" };
    }
    if (url.includes("/terms-and-conditions")) {
      return { situation: "portal_terms" };
    }
  }

  // Find a Grant patterns
  if (portalId === "find-a-grant") {
    if (url.includes("/apply/applicant") && !url.includes("/section")) {
      return { situation: "portal_dashboard" };
    }
    if (url.includes("/section/")) {
      return { situation: "application_form" };
    }
  }

  // UKRI patterns
  if (portalId === "ukri-funding") {
    if (url.includes("/login") || url.includes("/sign-in")) {
      return { situation: "login_required" };
    }
    if (url.includes("/dashboard") || url.includes("/applications")) {
      return { situation: "portal_dashboard" };
    }
  }

  return null;
}

/**
 * Analyze sidebar/tab navigation on a multi-section application page.
 * Returns detected sections with their labels, selectors, and completion status.
 */
export async function analyzeApplicationSections(page: Page): Promise<DetectedSection[]> {
  const sections = await page.evaluate(() => {
    const results: { label: string; selector: string; completed: boolean }[] = [];

    // Strategy 1: Look for sidebar/task-list navigation links
    const navSelectors = [
      ".section-nav a", ".task-list a", "[class*='section'] a",
      "nav a", ".application-nav a", "[role='navigation'] a",
      ".sidebar a", ".side-nav a", "[class*='sidebar'] a",
      "[role='tablist'] button", "[role='tablist'] a",
    ];

    for (const sel of navSelectors) {
      const links = document.querySelectorAll(sel);
      if (links.length < 2) continue;

      links.forEach((el, idx) => {
        const text = (el.textContent?.trim() ?? "").replace(/\s+/g, " ");
        if (!text || text.length > 100) return;

        // Skip generic nav items
        const skip = /^(home|dashboard|back|logout|sign out|help|support|profile|settings)$/i;
        if (skip.test(text)) return;

        const htmlEl = el as HTMLElement;
        const id = htmlEl.id;
        let selector = "";
        if (id) {
          selector = `#${id}`;
        } else {
          const href = (el as HTMLAnchorElement).getAttribute("href");
          if (href) {
            selector = `${el.tagName.toLowerCase()}[href="${href}"]`;
          } else {
            selector = `${sel}:nth-child(${idx + 1})`;
          }
        }

        // Detect completion: check for tick marks, "Complete", green styling
        const parent = htmlEl.closest("li, div, [class*='task']") ?? htmlEl;
        const parentText = parent.textContent?.toLowerCase() ?? "";
        const completed = parentText.includes("complete") ||
          parentText.includes("✓") ||
          parentText.includes("✔") ||
          parent.querySelector('[class*="complete"], [class*="done"], [class*="tick"], svg.complete') != null;

        results.push({ label: text, selector, completed });
      });

      if (results.length > 0) break; // use the first nav that has sections
    }

    return results;
  });

  return sections;
}
