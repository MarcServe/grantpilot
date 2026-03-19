import { chromium, type Browser, type Page } from "playwright";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as https from "https";
import * as http from "http";
import Anthropic from "@anthropic-ai/sdk";

const VIEWPORT = { width: 1280, height: 720 };
/** 5 min: stability over speed; users can wait ~10 min for submitted/review/needs info/login. */
const NAV_TIMEOUT_MS = 300_000;
const ACTION_TIMEOUT_MS = 300_000;

export interface FormFieldInfo {
  name: string;
  id: string | null;
  type: string;
  label: string;
  placeholder: string;
  options?: string[];
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
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
}

export async function newGrantPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Grants-Copilot/1.0",
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(ACTION_TIMEOUT_MS);
  return page;
}

export async function navigateToGrantUrl(
  page: Page,
  url: string
): Promise<{ ok: boolean; status?: number; finalUrl?: string; error?: string }> {
  try {
    const res = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    });
    const status = res?.status();
    const finalUrl = page.url();
    const ok = status != null ? status < 400 : true;
    if (ok) return { ok: true, status, finalUrl };
    return { ok: false, status, finalUrl, error: `HTTP ${status ?? "unknown"}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/**
 * Extract form field metadata from the page for Claude to map profile data.
 * Includes maxLength, required, and instruction text so filling respects form requirements.
 */
export async function getFormFields(page: Page): Promise<FormFieldInfo[]> {
  const fields = await page.evaluate(() => {
    const result: Array<{
      name: string;
      id: string | null;
      type: string;
      label: string;
      placeholder: string;
      options?: string[];
      maxLength?: number;
      required?: boolean;
      instruction?: string;
    }> = [];
    const inputs = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select'
    );
    inputs.forEach((el) => {
      const name = (el as HTMLInputElement).name || (el as HTMLInputElement).id || "";
      if (!name) return;
      const id = (el as HTMLInputElement).id || null;
      const type = ((el as HTMLInputElement).type || el.tagName.toLowerCase()) as string;
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
      if (!label) {
        const prev = (el as HTMLElement).previousElementSibling;
        if (prev && /label|span|p|div/i.test(prev.tagName))
          label = prev.textContent?.trim() ?? "";
      }
      const placeholder = ((el as HTMLInputElement).placeholder ?? "").trim();
      let options: string[] | undefined;
      if (el.tagName.toLowerCase() === "select") {
        options = Array.from((el as HTMLSelectElement).options)
          .map((o) => o.value)
          .filter((v) => v);
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
      let instructionText = "";
      const describedBy = (el as HTMLInputElement).getAttribute("aria-describedby");
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
      const instruction = instructionText.trim().slice(0, 500) || undefined;
      result.push({ name, id, type, label, placeholder, options, maxLength, required, instruction });
    });
    return result;
  });
  return fields as FormFieldInfo[];
}

export interface FillAction {
  selector: string;
  value: string;
  type?: "fill" | "select" | "check";
}

const FILL_DELAY_MS = 150;

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
      if (tag === "select") {
        await el.selectOption(a.value).catch(() => el.selectOption({ value: a.value }));
        applied++;
      } else if (type === "checkbox" || type === "radio") {
        const checked = /^(1|true|yes|on)$/i.test(a.value);
        await el.setChecked(checked);
        applied++;
      } else {
        await el.fill(a.value);
        applied++;
      }
      await el.dispose();
    } catch (e) {
      errors.push(`${a.selector}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { applied, errors };
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
const NEXT_LABELS = /next|continue|next step|next section|proceed|go to next/i;

/**
 * Vision fallback: ask Claude for a CSS selector for the Next/Continue or Submit button.
 * Returns selector or null on failure.
 */
async function getButtonSelectorWithVision(
  page: Page,
  intent: "next" | "submit"
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
      : `Look at this screenshot of a form. Find the "Next" or "Continue" or "Next step" button (NOT the final Submit button). Return ONLY a valid CSS selector that targets that button. One line, no explanation.`;
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
