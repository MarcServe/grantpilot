import { chromium, type Browser, type Page } from "playwright";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as https from "https";
import * as http from "http";
import Anthropic from "@anthropic-ai/sdk";
import type { GrantFormSchema } from "./types/grant-form-schema.js";

const VIEWPORT = { width: 1280, height: 720 };
/** 5 min: stability over speed; users can wait ~10 min for submitted/review/needs info/login. */
const NAV_TIMEOUT_MS = 300_000;
const ACTION_TIMEOUT_MS = 300_000;

export interface FormFieldInfo {
  name: string;
  id: string | null;
  selector?: string;
  type: string;
  label: string;
  placeholder: string;
  options?: { label: string; value: string; selector: string; checked?: boolean }[];
  /** HTML maxlength (characters). */
  maxLength?: number;
  /** Whether the field is required. */
  required?: boolean;
  /** Helper/instruction text (e.g. aria-describedby, next sibling) for limits like "Max 500 words". */
  instruction?: string;
}

export async function launchGrantBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
    ],
  });
}

const STEALTH_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-GB', 'en-US', 'en'] });
  window.chrome = { runtime: {} };
`;

export async function newGrantPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    ignoreHTTPSErrors: true,
    locale: "en-GB",
    timezoneId: "Europe/London",
  });
  await context.addInitScript(STEALTH_SCRIPT);
  const page = await context.newPage();
  page.setDefaultTimeout(ACTION_TIMEOUT_MS);
  return page;
}

export async function navigateToGrantUrl(
  page: Page,
  url: string
): Promise<{ ok: boolean; status?: number; finalUrl?: string; error?: string }> {
  try {
    console.log(`[browser] Navigating to: ${url}`);
    const res = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    });
    const status = res?.status();
    const finalUrl = page.url();
    console.log(`[browser] Navigation result: status=${status}, finalUrl=${finalUrl}`);
    const ok = status != null ? status < 400 : true;
    if (ok) return { ok: true, status, finalUrl };
    return { ok: false, status, finalUrl, error: `HTTP ${status ?? "unknown"}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[browser] Navigation error for ${url}: ${msg}`);
    return { ok: false, error: msg };
  }
}

/**
 * Extract form field metadata from the page for Claude to map profile data.
 * Includes maxLength, required, and instruction text so filling respects form requirements.
 */
export async function getFormFields(page: Page): Promise<FormFieldInfo[]> {
  const fields = await page.evaluate(() => {
    function selectorFor(el: Element): string {
      const input = el as HTMLInputElement;
      if (input.id) return `#${CSS.escape(input.id)}`;
      if (input.name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(input.name)}"]`;
      const dataId = (el as HTMLElement).getAttribute("data-automation-id");
      if (dataId) return `${el.tagName.toLowerCase()}[data-automation-id="${CSS.escape(dataId)}"]`;
      return el.tagName.toLowerCase();
    }

    function labelFor(el: Element): string {
      let label = "";
      const forId = (el as HTMLInputElement).id;
      if (forId) {
        const labelEl = document.querySelector(`label[for="${CSS.escape(forId)}"]`);
        if (labelEl) label = (labelEl as HTMLLabelElement).textContent?.trim() ?? "";
      }
      if (!label) {
        const parent = (el as HTMLElement).closest("label");
        if (parent) label = parent.textContent?.trim() ?? "";
      }
      if (!label) {
        const labelledBy = (el as HTMLElement).getAttribute("aria-labelledby");
        if (labelledBy) {
          label = labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
            .filter(Boolean)
            .join(" ");
        }
      }
      if (!label) {
        const prev = (el as HTMLElement).previousElementSibling;
        if (prev && /label|span|p|div/i.test(prev.tagName)) {
          label = prev.textContent?.trim() ?? "";
        }
      }
      return label.replace(/\s+/g, " ").trim();
    }

    function questionLabelFor(input: HTMLInputElement): string {
      const group =
        input.closest("fieldset") ??
        input.closest('[role="radiogroup"], [role="group"]') ??
        input.closest('[data-automation-id*="question"], [data-testid*="question"]') ??
        input.closest("div");
      const legend = group?.querySelector("legend");
      const heading = group?.querySelector("h1, h2, h3, h4, [role='heading']");
      const text = (legend ?? heading)?.textContent?.trim();
      if (text) return text.replace(/\s+/g, " ").slice(0, 300);
      const groupText = group?.textContent?.trim().replace(/\s+/g, " ");
      const optionText = labelFor(input);
      if (groupText && optionText) return groupText.replace(optionText, "").trim().slice(0, 300);
      return optionText || input.name || input.id || "Choice field";
    }

    function instructionFor(el: Element): string | undefined {
      let instructionText = "";
      const describedBy = (el as HTMLElement).getAttribute("aria-describedby");
      if (describedBy) {
        const parts = describedBy.trim().split(/\s+/);
        for (const idRef of parts) {
          const desc = document.getElementById(idRef);
          if (desc) instructionText += (desc.textContent?.trim() ?? "") + " ";
        }
      }
      const next = (el as HTMLElement).nextElementSibling;
      if (next && /^(div|p|span|small)$/i.test(next.tagName)) {
        const t = next.textContent?.trim() ?? "";
        if (t.length > 0 && t.length <= 300) instructionText += t + " ";
      }
      return instructionText.trim().slice(0, 500) || undefined;
    }

    const result: Array<{
      name: string;
      id: string | null;
      selector?: string;
      type: string;
      label: string;
      placeholder: string;
      options?: { label: string; value: string; selector: string; checked?: boolean }[];
      maxLength?: number;
      required?: boolean;
      instruction?: string;
    }> = [];

    const choiceInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]'));
    const groups = new Map<string, HTMLInputElement[]>();
    for (const input of choiceInputs) {
      const key = input.name || input.id || labelFor(input);
      if (!key) continue;
      const existing = groups.get(key) ?? [];
      existing.push(input);
      groups.set(key, existing);
    }
    for (const [name, inputs] of groups) {
      const first = inputs[0];
      const type = first.type === "radio" ? "radio_group" : "checkbox_group";
      result.push({
        name,
        id: null,
        selector: first.name ? `input[name="${CSS.escape(first.name)}"]` : selectorFor(first),
        type,
        label: questionLabelFor(first),
        placeholder: "",
        options: inputs.map((input) => ({
          label: labelFor(input) || input.value || input.id || input.name,
          value: input.value || labelFor(input) || "on",
          selector: selectorFor(input),
          checked: input.checked,
        })),
        required: inputs.some((input) => input.required || input.hasAttribute("required")),
        instruction: instructionFor(first),
      });
    }

    const inputs = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="radio"]):not([type="checkbox"]), textarea, select'
    );
    inputs.forEach((el) => {
      const name = (el as HTMLInputElement).name || (el as HTMLInputElement).id || "";
      if (!name) return;
      const id = (el as HTMLInputElement).id || null;
      const type = ((el as HTMLInputElement).type || el.tagName.toLowerCase()) as string;
      const label = labelFor(el);
      const placeholder = ((el as HTMLInputElement).placeholder ?? "").trim();
      let options: { label: string; value: string; selector: string; checked?: boolean }[] | undefined;
      if (el.tagName.toLowerCase() === "select") {
        options = Array.from((el as HTMLSelectElement).options)
          .map((o) => ({ label: o.textContent?.trim() || o.value, value: o.value, selector: `${selectorFor(el)} option[value="${CSS.escape(o.value)}"]`, checked: o.selected }))
          .filter((o) => o.value || o.label);
      }
      let maxLength: number | undefined;
      const maxLenAttr = (el as HTMLInputElement).getAttribute("maxlength");
      if (maxLenAttr != null) {
        const n = parseInt(maxLenAttr, 10);
        if (!isNaN(n) && n > 0) maxLength = n;
      }
      if (maxLength == null && typeof (el as HTMLInputElement).maxLength === "number" && (el as HTMLInputElement).maxLength > 0)
        maxLength = (el as HTMLInputElement).maxLength;
      const required = (el as HTMLInputElement).hasAttribute("required") || (el as HTMLInputElement).required;
      const instruction = instructionFor(el);
      result.push({ name, id, selector: selectorFor(el), type, label, placeholder, options, maxLength, required, instruction });
    });
    document.querySelectorAll<HTMLElement>('[contenteditable="true"], [role="textbox"][contenteditable]').forEach((el, idx) => {
      const name = el.getAttribute("name") || el.id || el.getAttribute("aria-label") || `rich_text_${idx + 1}`;
      const label = labelFor(el) || el.getAttribute("aria-label") || name;
      result.push({
        name,
        id: el.id || null,
        selector: selectorFor(el),
        type: "contenteditable",
        label,
        placeholder: el.getAttribute("data-placeholder") ?? "",
        required: el.getAttribute("aria-required") === "true",
        instruction: instructionFor(el),
      });
    });
    return result;
  });
  return fields as FormFieldInfo[];
}

export interface FillAction {
  selector: string;
  value: string;
  type?: "fill" | "select" | "check" | "choose_radio" | "choose_checkbox" | "rich_text" | "autocomplete" | "date" | "range";
}

const FILL_DELAY_MS = 150;

function normaliseChoiceText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

async function chooseByOptionLabel(page: Page, selector: string, value: string): Promise<boolean> {
  const wanted = normaliseChoiceText(value);
  const inputs = await page.$$(selector);
  for (const input of inputs) {
    try {
      const { inputValue, label } = await input.evaluate((el) => {
        const inputEl = el as HTMLInputElement;
        let labelText = "";
        if (inputEl.id) {
          const labelEl = document.querySelector(`label[for="${CSS.escape(inputEl.id)}"]`);
          if (labelEl) labelText = labelEl.textContent?.trim() ?? "";
        }
        if (!labelText) labelText = inputEl.closest("label")?.textContent?.trim() ?? "";
        if (!labelText) {
          const labelledBy = inputEl.getAttribute("aria-labelledby");
          if (labelledBy) {
            labelText = labelledBy
              .split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
              .filter(Boolean)
              .join(" ");
          }
        }
        return { inputValue: inputEl.value ?? "", label: labelText.replace(/\s+/g, " ").trim() };
      });
      const haystack = normaliseChoiceText(`${label} ${inputValue}`);
      if (haystack === wanted || haystack.includes(wanted) || wanted.includes(normaliseChoiceText(label || inputValue))) {
        await input.scrollIntoViewIfNeeded();
        await input.setChecked(true);
        const checked = await input.evaluate((el) => (el as HTMLInputElement).checked);
        await input.dispose();
        for (const other of inputs) {
          if (other !== input) await other.dispose().catch(() => {});
        }
        return checked;
      }
    } catch {
      // try next option
    }
  }
  for (const input of inputs) await input.dispose().catch(() => {});
  return false;
}

async function verifyAction(page: Page, selector: string, expected: string, type: FillAction["type"]): Promise<boolean> {
  try {
    if (type === "choose_radio" || type === "choose_checkbox") {
      const wanted = normaliseChoiceText(expected);
      return await page.$$eval(selector, (els, wantedValue) => {
        const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
        return els.some((el) => {
          const input = el as HTMLInputElement;
          if (!input.checked) return false;
          let label = "";
          if (input.id) {
            const labelEl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
            if (labelEl) label = labelEl.textContent?.trim() ?? "";
          }
          if (!label) label = input.closest("label")?.textContent?.trim() ?? "";
          const text = normalise(`${label} ${input.value ?? ""}`);
          return text.includes(wantedValue) || wantedValue.includes(normalise(label || input.value || ""));
        });
      }, wanted);
    }
    const el = await page.$(selector);
    if (!el) return false;
    const tag = await el.evaluate((e) => (e as HTMLElement).tagName.toLowerCase());
    const inputType = await el.evaluate((e) => (e as HTMLInputElement).type?.toLowerCase());
    const actual = await el.evaluate((e) => {
      const html = e as HTMLElement;
      if (html.isContentEditable) return html.textContent ?? "";
      const element = e as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if ((element as HTMLInputElement).type === "checkbox" || (element as HTMLInputElement).type === "radio") {
        return (element as HTMLInputElement).checked ? "true" : "false";
      }
      return element.value ?? "";
    });
    await el.dispose();
    if (tag === "select") return actual === expected || normaliseChoiceText(actual).includes(normaliseChoiceText(expected));
    if (inputType === "checkbox" || inputType === "radio") return /^(1|true|yes|on)$/i.test(expected) === (actual === "true");
    return actual.trim().length > 0;
  } catch {
    return false;
  }
}

export async function applyFillActions(
  page: Page,
  actions: FillAction[]
): Promise<{ applied: number; errors: string[] }> {
  const errors: string[] = [];
  let applied = 0;
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    if (i > 0) {
      await page.waitForTimeout(FILL_DELAY_MS);
    }
    try {
      const el = await page.$(a.selector);
      if (!el) {
        errors.push(`Element not found: ${a.selector}`);
        continue;
      }
      await el.scrollIntoViewIfNeeded();
      const tag = await el.evaluate((e) => (e as HTMLElement).tagName.toLowerCase());
      const type = await el.evaluate((e) => (e as HTMLInputElement).type?.toLowerCase());
      await el.dispose();

      if (a.type === "choose_radio" || a.type === "choose_checkbox") {
        const chosen = await chooseByOptionLabel(page, a.selector, a.value);
        if (!chosen) {
          errors.push(`${a.selector}: option not found or not selected for "${a.value}"`);
          continue;
        }
      } else if (tag === "select") {
        const selectEl = await page.$(a.selector);
        if (!selectEl) {
          errors.push(`Element not found: ${a.selector}`);
          continue;
        }
        await selectEl.selectOption(a.value).catch(() => selectEl.selectOption({ label: a.value }));
        await selectEl.dispose();
      } else if (type === "checkbox" || type === "radio") {
        const checked = /^(1|true|yes|on)$/i.test(a.value);
        const inputEl = await page.$(a.selector);
        if (!inputEl) {
          errors.push(`Element not found: ${a.selector}`);
          continue;
        }
        await inputEl.setChecked(checked);
        await inputEl.dispose();
      } else if (a.type === "rich_text" || tag === "div" || tag === "span") {
        const ok = await page.evaluate(({ selector, value }) => {
          const el = document.querySelector(selector) as HTMLElement | null;
          if (!el) return false;
          el.focus();
          el.textContent = value;
          el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }, { selector: a.selector, value: a.value });
        if (!ok) {
          errors.push(`Element not found: ${a.selector}`);
          continue;
        }
      } else if (a.type === "autocomplete") {
        const inputEl = await page.$(a.selector);
        if (!inputEl) {
          errors.push(`Element not found: ${a.selector}`);
          continue;
        }
        await inputEl.fill(a.value);
        await page.waitForTimeout(750);
        await inputEl.press("ArrowDown").catch(() => {});
        await inputEl.press("Enter").catch(() => {});
        await inputEl.dispose();
      } else {
        const inputEl = await page.$(a.selector);
        if (!inputEl) {
          errors.push(`Element not found: ${a.selector}`);
          continue;
        }
        await inputEl.fill(a.value);
        await inputEl.dispose();
      }

      const verified = await verifyAction(page, a.selector, a.value, a.type);
      if (verified) {
        applied++;
      } else {
        errors.push(`${a.selector}: action did not verify after applying`);
      }
    } catch (e) {
      errors.push(`${a.selector}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const validationErrors = await getValidationErrors(page);
  errors.push(...validationErrors);
  return { applied, errors };
}

export async function getValidationErrors(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const messages = new Set<string>();
    document.querySelectorAll('[aria-invalid="true"], .error, .field-error, .validation-error, [role="alert"]').forEach((el) => {
      const text = el.textContent?.trim().replace(/\s+/g, " ");
      if (text && text.length <= 300) messages.add(text);
    });
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select").forEach((el) => {
      if (!el.checkValidity() && el.validationMessage) {
        const label = el.labels?.[0]?.textContent?.trim() || el.name || el.id || "Field";
        messages.add(`${label}: ${el.validationMessage}`);
      }
    });
    return Array.from(messages).slice(0, 10);
  }).catch(() => []);
}

/**
 * Download a file from URL to a temp file and return path.
 */
export function downloadToTemp(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    const tmpDir = os.tmpdir();
    const filename = path.basename(new URL(url).pathname) || "document";
    const ext = path.extname(filename) || ".bin";
    const tmpPath = path.join(tmpDir, `grantpilot_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);

    const file = fs.createWriteStream(tmpPath);
    protocol
      .get(url, { headers: { "User-Agent": "Grants-Copilot/1.0" } }, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          file.close();
          fs.unlink(tmpPath, () => {});
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close(() => resolve(tmpPath));
        });
      })
      .on("error", (err) => {
        file.close();
        fs.unlink(tmpPath, () => {});
        reject(err);
      });
  });
}

export async function setFileInputs(
  page: Page,
  fileInputSelectors: string[],
  filePaths: string[]
): Promise<{ set: number; errors: string[] }> {
  const errors: string[] = [];
  let set = 0;
  const len = Math.min(fileInputSelectors.length, filePaths.length);
  for (let i = 0; i < len; i++) {
    try {
      const el = await page.$(fileInputSelectors[i]);
      if (!el) {
        errors.push(`File input not found: ${fileInputSelectors[i]}`);
        continue;
      }
      await el.setInputFiles(filePaths[i]);
      set++;
      await el.dispose();
    } catch (e) {
      errors.push(`${fileInputSelectors[i]}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { set, errors };
}

/**
 * Capture current form field values and file input names for the "filled data" summary.
 */
export interface FilledField {
  label: string;
  name: string;
  value: string;
}

export interface FilledFormSnapshot {
  fields: FilledField[];
  fileNames: string[];
  capturedAt: string;
  screenshotBase64?: string;
  formSchema?: GrantFormSchema;
  automationRisks?: string[];
  humanReviewRequired?: boolean;
}

export async function getFilledFormSnapshot(page: Page): Promise<FilledFormSnapshot> {
  const result = await page.evaluate(() => {
    const fields: Array<{ label: string; name: string; value: string }> = [];
    const inputs = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]), textarea, select'
    );
    inputs.forEach((el) => {
      const name = (el as HTMLInputElement).name || (el as HTMLInputElement).id || "";
      if (!name) return;
      let value = "";
      const tag = (el as HTMLElement).tagName.toLowerCase();
      const type = (el as HTMLInputElement).type?.toLowerCase();
      if (tag === "select") {
        value = (el as HTMLSelectElement).value ?? "";
      } else if (type === "checkbox" || type === "radio") {
        value = (el as HTMLInputElement).checked ? "Yes" : "No";
      } else {
        value = ((el as HTMLInputElement).value ?? "").trim();
      }
      let label = "";
      const forId = (el as HTMLInputElement).id;
      if (forId) {
        const labelEl = document.querySelector(`label[for="${forId}"]`);
        if (labelEl) label = (labelEl as HTMLLabelElement).textContent?.trim() ?? "";
      }
      if (!label) {
        const parent = (el as HTMLElement).closest("label");
        if (parent) label = parent.textContent?.trim() ?? "";
      }
      if (!label) label = name;
      fields.push({ label: label.slice(0, 80), name, value: value.slice(0, 500) });
    });
    const fileNames: string[] = [];
    document.querySelectorAll('input[type="file"]').forEach((el) => {
      const files = (el as HTMLInputElement).files;
      if (files) for (let i = 0; i < files.length; i++) fileNames.push(files[i].name || "file");
    });
    return { fields, fileNames };
  });
  let screenshotBase64: string | undefined;
  try {
    const buf = await page.screenshot({ fullPage: true, type: "jpeg", quality: 60 });
    screenshotBase64 = buf.toString("base64");
  } catch {
    // screenshot is best-effort
  }

  return {
    fields: result.fields as FilledField[],
    fileNames: result.fileNames as string[],
    capturedAt: new Date().toISOString(),
    screenshotBase64,
  };
}

/**
 * Apply values from a filled snapshot (original or user-edited) to the form.
 * Used by submit_application to replay edited values instead of re-mapping via Claude.
 */
export async function applySnapshotValues(
  page: Page,
  fields: FilledField[]
): Promise<{ applied: number; errors: string[] }> {
  const actions: FillAction[] = fields
    .filter((f) => f.value && f.value.trim() !== "")
    .map((f) => ({
      selector: f.name.includes("#")
        ? f.name
        : `[name="${f.name}"], #${f.name}`,
      value: f.value,
    }));
  return applyFillActions(page, actions);
}

/** Text that indicates a "next step" wizard button (not final Submit). */
const NEXT_LABELS = /next|continue|next step|next section|proceed|go to next|siguiente|continuar/i;

/**
 * Vision fallback: ask Claude for a CSS selector for the Next/Continue or Submit button.
 * Returns selector or null on failure.
 */
async function getButtonSelectorWithVision(
  page: Page,
  intent: "next" | "submit" | "apply"
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey?.trim()) return null;
  let screenshotBase64: string;
  try {
    const buf = await page.screenshot({ type: "png", fullPage: false });
    screenshotBase64 = buf.toString("base64");
  } catch {
    return null;
  }
  const prompt =
    intent === "submit"
      ? `Look at this screenshot of a form. Find the main "Submit" or "Send" or "Submit application" button. Return ONLY a valid CSS selector that targets that button (e.g. button[type="submit"], input[value="Submit"], or a more specific selector). One line, no explanation.`
      : intent === "apply"
        ? `Look at this screenshot of a grant information page. Find the "Apply", "Apply now", "Start application", "Begin application", or similar button/link that starts the grant application process. Return ONLY a valid CSS selector that targets that button. One line, no explanation.`
        : `Look at this screenshot of a form. Find the "Next", "Continue", "Siguiente", or "Continuar" button (NOT the final Submit/Enviar button). Return ONLY a valid CSS selector that targets that button. One line, no explanation.`;
  try {
    const anthropic = new Anthropic({ apiKey });
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 150,
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
    const text = (res.content?.[0]?.type === "text" ? res.content[0].text : "").trim();
    const selector = text.split("\n")[0]?.trim().replace(/^["']|["']$/g, "");
    if (!selector || selector.length > 200) return null;
    const el = await page.$(selector);
    if (el) {
      await el.dispose();
      return selector;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Find and click a "Next" / "Continue" wizard button (not Submit).
 * Returns true if a next button was clicked, false if none found.
 * Uses vision fallback when DOM-based search fails.
 */
export async function clickNextOrContinueButton(page: Page): Promise<boolean> {
  const candidates = [
    page.locator("button", { hasText: NEXT_LABELS }),
    page.locator('input[type="button"]', { hasText: NEXT_LABELS }),
    page.locator('input[type="submit"]', { hasText: NEXT_LABELS }),
    page.locator('a[href]', { hasText: NEXT_LABELS }),
    page.locator('[role="button"]', { hasText: NEXT_LABELS }),
  ];
  for (const loc of candidates) {
    try {
      const count = await loc.count();
      for (let i = 0; i < count; i++) {
        const node = loc.nth(i);
        const text = (await node.textContent()) || (await node.getAttribute("value")) || "";
        if (/\bsubmit\b/i.test(text)) continue;
        await node.scrollIntoViewIfNeeded();
        await node.click();
        await Promise.race([
          page.waitForLoadState("domcontentloaded").catch(() => {}),
          page.waitForTimeout(3000),
        ]);
        return true;
      }
    } catch {
      // try next locator
    }
  }
  const visionSelector = await getButtonSelectorWithVision(page, "next");
  if (visionSelector) {
    try {
      const el = await page.$(visionSelector);
      if (el) {
        await el.scrollIntoViewIfNeeded();
        await el.click();
        await el.dispose();
        await Promise.race([
          page.waitForLoadState("domcontentloaded").catch(() => {}),
          page.waitForTimeout(3000),
        ]);
        return true;
      }
    } catch {
      // ignore
    }
  }
  return false;
}

export async function clickSubmitButton(page: Page): Promise<{ clicked: boolean; error?: string }> {
  const selectors = [
    'input[type="submit"]',
    'button[type="submit"]',
    'button:has-text("Submit")',
    'button:has-text("Send")',
    'input[value="Submit"]',
    '[role="button"]:has-text("Submit")',
    'a:has-text("Submit")',
  ];
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.click();
        await el.dispose();
        return { clicked: true };
      }
    } catch {
      // try next
    }
  }
  const visionSelector = await getButtonSelectorWithVision(page, "submit");
  if (visionSelector) {
    try {
      const el = await page.$(visionSelector);
      if (el) {
        await el.scrollIntoViewIfNeeded();
        await el.click();
        await el.dispose();
        return { clicked: true };
      }
    } catch {
      // ignore
    }
  }
  return { clicked: false, error: "No submit button found" };
}

export function cleanupTempFiles(paths: string[]): void {
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      // ignore
    }
  }
}

/** Apply button text patterns */
const APPLY_BUTTON_TEXT = /\b(apply\s*(now|here|online)?|start\s*(now|your\s*application|application|form)?|begin\s*(now|application|form)?|apply\s*for\s*(this|the)\s*(grant|fund|scheme|competition)|empezar\s*ahora|comenzar|iniciar|start)\b/i;

/**
 * Find and click an "Apply" / "Start application" button on a grant info page.
 * Tries the provided selector first (from vision detection), then DOM search, then vision fallback.
 * Returns true if a button was found and clicked.
 */
export async function findAndClickApplyButton(
  page: Page,
  selectorHint?: string
): Promise<{ clicked: boolean; error?: string }> {
  const isOfficeForms = /forms\.office\.com|forms\.microsoft\.com/i.test(page.url());
  if (isOfficeForms) {
    const officeCandidates = [
      page.getByRole("button", { name: /empezar|start|begin|comenzar|iniciar/i }),
      page.locator("button", { hasText: /empezar|start|begin|comenzar|iniciar/i }),
      page.locator('[role="button"]', { hasText: /empezar|start|begin|comenzar|iniciar/i }),
      page.locator('input[type="button"], input[type="submit"]').filter({ hasText: /empezar|start|begin|comenzar|iniciar/i }),
    ];
    for (const loc of officeCandidates) {
      try {
        const count = await loc.count();
        for (let i = 0; i < count; i++) {
          const node = loc.nth(i);
          if (!(await node.isVisible())) continue;
          await node.scrollIntoViewIfNeeded();
          await node.click();
          await Promise.race([
            page.waitForLoadState("networkidle").catch(() => {}),
            page.waitForTimeout(5000),
          ]);
          return { clicked: true };
        }
      } catch {
        // try next Office Forms candidate
      }
    }
  }

  // 1. Try the selector hint from page-situation vision detection
  if (selectorHint) {
    try {
      const el = await page.$(selectorHint);
      if (el) {
        await el.scrollIntoViewIfNeeded();
        await el.click();
        await el.dispose();
        await Promise.race([
          page.waitForLoadState("domcontentloaded").catch(() => {}),
          page.waitForTimeout(5000),
        ]);
        return { clicked: true };
      }
    } catch {
      // selector didn't work, try other methods
    }
  }

  // 2. DOM-based search for Apply buttons
  const candidates = [
    page.locator("a", { hasText: APPLY_BUTTON_TEXT }),
    page.locator("button", { hasText: APPLY_BUTTON_TEXT }),
    page.locator('input[type="submit"]', { hasText: APPLY_BUTTON_TEXT }),
    page.locator('[role="button"]', { hasText: APPLY_BUTTON_TEXT }),
  ];
  for (const loc of candidates) {
    try {
      const count = await loc.count();
      for (let i = 0; i < count; i++) {
        const node = loc.nth(i);
        if (await node.isVisible()) {
          await node.scrollIntoViewIfNeeded();
          await node.click();
          await Promise.race([
            page.waitForLoadState("domcontentloaded").catch(() => {}),
            page.waitForTimeout(5000),
          ]);
          return { clicked: true };
        }
      }
    } catch {
      // try next
    }
  }

  // 3. Vision fallback: ask Claude for the Apply button selector
  const visionSelector = await getButtonSelectorWithVision(page, "apply");
  if (visionSelector) {
    try {
      const el = await page.$(visionSelector);
      if (el) {
        await el.scrollIntoViewIfNeeded();
        await el.click();
        await el.dispose();
        await Promise.race([
          page.waitForLoadState("domcontentloaded").catch(() => {}),
          page.waitForTimeout(5000),
        ]);
        return { clicked: true };
      }
    } catch {
      // ignore
    }
  }

  return { clicked: false, error: "No Apply button found" };
}

/**
 * Filter form fields to only those that look like genuine application fields,
 * excluding site chrome (search bars, cookie toggles, newsletter, navigation).
 */
export async function filterApplicationFields(fields: FormFieldInfo[]): Promise<FormFieldInfo[]> {
  const chromeNames = /^(search|q|query|s|keyword|filter|sort|lang|language|locale|cookie|consent|newsletter|subscribe|email_subscribe|signup_email|mc_email|mc-embedded-subscribe-email|__search|_search)$/i;
  const chromeLabels = /\b(search|filter|sort by|language|cookie|newsletter|subscribe|sign up for|search the site|find a grant)\b/i;

  return fields.filter((f) => {
    const name = (f.name || "").toLowerCase();
    const label = (f.label || "").toLowerCase();
    const placeholder = (f.placeholder || "").toLowerCase();
    const type = (f.type || "").toLowerCase();

    if (type === "search") return false;
    if (chromeNames.test(name)) return false;
    if (chromeLabels.test(label)) return false;
    if (chromeLabels.test(placeholder)) return false;

    return true;
  });
}
