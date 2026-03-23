/**
 * Scout: find application form URL from a grant programme homepage using Playwright + Claude.
 * Vision (screenshot + Claude) is the main and default at every step for reliability; link/button
 * navigation is only used when vision returns NOT_FOUND to move to the next page and try again.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Page } from "playwright";
import { launchGrantBrowser, newGrantPage, navigateToGrantUrl } from "./browser.js";
import { getSupabase } from "./supabase.js";

export class ApiCreditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiCreditError";
  }
}

function isApiCreditError(err: unknown): boolean {
  if (err instanceof ApiCreditError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /credit balance is too low/i.test(msg) || /insufficient.{0,20}credits?/i.test(msg);
}

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const anthropic = new Anthropic({ apiKey: requiredEnv("ANTHROPIC_API_KEY") });

const MAX_SCOUT_HOPS = 3;
const FORM_HOSTS = ["airtable.com", "typeform.com", "forms.gle", "docs.google.com/forms", "smartsheet.com", "jotform.com"];
const APPLY_LINK_TEXT = /apply|start\s*(?:your)?\s*application|begin\s*application|open\s*form|apply\s*now|start\s*application|submit\s*application|apply\s*here|application\s*form/i;

export interface GrantLinkJob {
  id: number;
  grant_id: string;
  homepage_url: string;
  grant_name: string | null;
  funder: string | null;
  status: string;
}

/** Get one pending scout job and mark it running. */
export async function getNextScoutJob(): Promise<GrantLinkJob | null> {
  const { data: rows, error } = await getSupabase()
    .from("grant_links")
    .select("id, grant_id, homepage_url, grant_name, funder, status")
    .eq("status", "pending")
    .order("id", { ascending: true })
    .limit(1);

  if (error || !rows?.length) return null;

  const row = rows[0] as { id: number; grant_id: string; homepage_url: string; grant_name: string | null; funder: string | null; status: string };
  const { error: updateErr } = await getSupabase()
    .from("grant_links")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", row.id);

  if (updateErr) return null;
  return {
    id: row.id,
    grant_id: row.grant_id,
    homepage_url: row.homepage_url,
    grant_name: row.grant_name,
    funder: row.funder,
    status: "running",
  };
}

/** Extract links (href + text) from the current page. Includes external links (e.g. Airtable, Typeform). */
async function getPageLinks(page: Page): Promise<{ href: string; text: string }[]> {
  return page.evaluate(() => {
    const out: { href: string; text: string }[] = [];
    document.querySelectorAll("a[href]").forEach((a) => {
      const rawHref = (a as HTMLAnchorElement).href;
      const href = typeof rawHref === "string" ? rawHref : String(rawHref ?? "");
      if (!href || href.startsWith("mailto:") || href.startsWith("javascript:") || href.startsWith("#")) return;
      try {
        const u = new URL(href);
        if (u.protocol !== "http:" && u.protocol !== "https:") return;
      } catch {
        return;
      }
      const text = (a as HTMLAnchorElement).textContent?.replace(/\s+/g, " ").trim().slice(0, 120) ?? "";
      out.push({ href, text });
    });
    return out;
  });
}

/** Apply-like button descriptor for clicking when the form is not a direct link. */
export interface ApplyButtonCandidate {
  text: string;
  id: string | null;
  name: string | null;
  tagName: string;
}

/** Get links that look like "Apply" and buttons with Apply-like text (so we can click them for multi-step). */
async function getApplyCandidates(page: Page): Promise<{ links: { href: string; text: string }[]; buttons: ApplyButtonCandidate[] }> {
  const links = await getPageLinks(page);
  const applyLinks = links.filter((l) => APPLY_LINK_TEXT.test(l.text));
  const buttons = await page.evaluate((pattern: string) => {
    const re = new RegExp(pattern, "i");
    const out: { text: string; id: string | null; name: string | null; tagName: string }[] = [];
    const candidates = document.querySelectorAll("button, input[type='submit'], input[type='button'], a[href], [role='button']");
    candidates.forEach((el) => {
      const tag = (el as HTMLElement).tagName.toLowerCase();
      const text = ((el as HTMLElement).textContent ?? (el as HTMLInputElement).value ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
      if (!text || !re.test(text)) return;
      if (/\bsubmit\b/i.test(text) && !/apply|start\s*application/i.test(text)) return;
      const href = (el as HTMLAnchorElement).href;
      if (href && (tag === "a" || (el as HTMLAnchorElement).tagName === "A")) return;
      const id = (el as HTMLElement).id || null;
      const name = (el as HTMLInputElement).name || null;
      out.push({ text, id, name, tagName: tag });
    });
    return out;
  }, APPLY_LINK_TEXT.source);
  return { links: applyLinks, buttons };
}

/** Returns true if the current page looks like an application form (many inputs or known form host). */
async function isFormLikePage(page: Page): Promise<boolean> {
  const url = page.url().toLowerCase();
  if (FORM_HOSTS.some((h) => url.includes(h))) return true;
  const count = await page.evaluate(() => {
    const inputs = document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select");
    return inputs.length;
  });
  return count >= 3;
}

function escapeCssId(id: string): string {
  return id.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

/** Click an Apply-like button (by id, name, or text). Returns true if a click was performed. */
async function clickApplyButton(page: Page, button: ApplyButtonCandidate): Promise<boolean> {
  if (button.id) {
    try {
      await page.locator(`#${escapeCssId(button.id)}`).first().click();
      await Promise.race([page.waitForLoadState("domcontentloaded").catch(() => {}), page.waitForTimeout(3000)]);
      return true;
    } catch {
      // fallback to text
    }
  }
  if (button.name && (button.tagName === "input" || button.tagName === "button")) {
    try {
      const nameEsc = button.name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      await page.locator(`${button.tagName}[name="${nameEsc}"]`).first().click();
      await Promise.race([page.waitForLoadState("domcontentloaded").catch(() => {}), page.waitForTimeout(3000)]);
      return true;
    } catch {
      // fallback to text
    }
  }
  const textSlice = button.text.slice(0, 30);
  try {
    await page.getByRole("button", { name: new RegExp(textSlice.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first().click();
    await Promise.race([page.waitForLoadState("domcontentloaded").catch(() => {}), page.waitForTimeout(3000)]);
    return true;
  } catch {
    try {
      const safe = textSlice.replace(/"/g, '\\"');
      await page.locator(`button:has-text("${safe}"), input[type="submit"]:has-text("${safe}"), [role="button"]:has-text("${safe}")`).first().click();
      await Promise.race([page.waitForLoadState("domcontentloaded").catch(() => {}), page.waitForTimeout(3000)]);
      return true;
    } catch {
      return false;
    }
  }
}

/** Ask Claude which link is the application form (text-only). Returns URL or null. */
async function askClaudeForFormUrl(
  pageUrl: string,
  links: { href: string; text: string }[]
): Promise<string | null> {
  const linkList = links
    .slice(0, 80)
    .map((l) => `${l.href} (text: "${l.text}")`)
    .join("\n");

  const prompt = `You are a grant research agent. This is a grant programme or funding opportunity page.

Page URL: ${pageUrl}

Here are links from the page (href and link text):
${linkList}

Your task: identify the SINGLE link that goes directly to the application form or "Apply now" page (e.g. Airtable form, Typeform, Google Form, or the funder's application page). Ignore links to general info, terms, contact, or programme overview.

Reply with ONLY the full application form URL, or the single word NOT_FOUND if no clear application link exists. Do not include quotes or explanation.`;

  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const text = (res.content?.[0]?.type === "text" ? res.content[0].text : "").trim();
  if (!text || text.toUpperCase() === "NOT_FOUND") return null;

  const url = text.split(/\s/)[0].replace(/^["']|["']$/g, "");
  try {
    new URL(url);
    return url;
  } catch {
    return null;
  }
}

/** Vision-first: screenshot + Claude to find the application form link (primary and default). */
async function askClaudeForFormUrlWithVision(page: Page, pageUrl: string): Promise<string | null> {
  let screenshotBase64: string;
  try {
    const buf = await page.screenshot({ type: "png", fullPage: false });
    screenshotBase64 = buf.toString("base64");
  } catch {
    return null;
  }
  const prompt = `Look at this screenshot of a grant programme or funding opportunity webpage (URL: ${pageUrl}).

See the page as a user would. Your task: identify the link or button that goes to the APPLICATION FORM or "Apply now" page (e.g. Airtable, Typeform, Google Form, or the funder's application form). Ignore links to general info, terms, contact, or programme overview.

Reply with ONLY one of:
1. The full URL of that application form link (as it would appear in the page's href), or
2. The single word NOT_FOUND if you cannot identify a clear application form link.

Do not include quotes or explanation.`;

  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 512,
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
  if (!text || text.toUpperCase() === "NOT_FOUND") return null;

  const url = text.split(/\s/)[0].replace(/^["']|["']$/g, "");
  try {
    new URL(url);
    return url;
  } catch {
    return null;
  }
}

/** Run Scout discovery: vision-first at every step; only follow Apply link/button when vision says NOT_FOUND. */
export async function runScoutDiscovery(page: Page, homepageUrl: string): Promise<string | null> {
  const { ok } = await navigateToGrantUrl(page, homepageUrl);
  if (!ok) return null;

  let lastFormUrl: string | null = null;

  for (let hop = 0; hop < MAX_SCOUT_HOPS; hop++) {
    const currentUrl = page.url();

    if (await isFormLikePage(page)) {
      return currentUrl;
    }

    // Vision is the main and default: see the page like a human and identify the application form link.
    let formUrl: string | null = null;
    try {
      formUrl = await askClaudeForFormUrlWithVision(page, currentUrl);
    } catch {
      // Only fall back to link-only if vision fails (e.g. API error); grants are sensitive, prefer vision.
      const links = await getPageLinks(page);
      if (links.length > 0) formUrl = await askClaudeForFormUrl(currentUrl, links);
    }

    if (formUrl) {
      lastFormUrl = formUrl;
      if (formUrl === currentUrl || formUrl === homepageUrl) {
        return formUrl;
      }
      try {
        const nav = await page.goto(formUrl, { waitUntil: "domcontentloaded", timeout: 300_000 });
        if (nav && nav.status() >= 400) return formUrl;
        if (await isFormLikePage(page)) return page.url();
        return formUrl;
      } catch {
        return formUrl;
      }
    }

    // Vision returned NOT_FOUND: move to next page by following an Apply link or clicking Apply button.
    const { links: applyLinks, buttons: applyButtons } = await getApplyCandidates(page);

    const applyLink = applyLinks.find((l) => FORM_HOSTS.some((h) => l.href.toLowerCase().includes(h)))
      ?? applyLinks[0];
    if (applyLink) {
      try {
        await page.goto(applyLink.href, { waitUntil: "domcontentloaded", timeout: 300_000 });
        await page.waitForTimeout(2000);
        if (await isFormLikePage(page)) return page.url();
        continue;
      } catch {
        lastFormUrl = applyLink.href;
      }
    }

    if (applyButtons.length > 0) {
      const clicked = await clickApplyButton(page, applyButtons[0]);
      if (clicked) {
        await page.waitForTimeout(2000);
        if (await isFormLikePage(page)) return page.url();
        continue;
      }
    }

    if (lastFormUrl) return lastFormUrl;
    break;
  }

  return lastFormUrl;
}

export async function markScoutJobResult(
  jobId: number,
  status: "found" | "manual_review_needed" | "failed",
  applicationFormUrl?: string | null,
  errorMessage?: string | null
): Promise<void> {
  const patch: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "found" && applicationFormUrl) {
    patch.application_form_url = applicationFormUrl;
    patch.discovered_at = new Date().toISOString();
  }
  if (errorMessage) patch.error_message = errorMessage;

  await getSupabase().from("grant_links").update(patch).eq("id", jobId);
}

/** Update Grant.applicationUrl when Scout finds a form URL. */
export async function updateGrantApplicationUrl(grantId: string, applicationFormUrl: string): Promise<void> {
  await getSupabase()
    .from("Grant")
    .update({
      applicationUrl: applicationFormUrl,
      updatedAt: new Date().toISOString(),
    })
    .eq("id", grantId);
}

/** Process one Scout job: open page, find form URL, update grant_links and Grant. */
export async function processScoutJob(job: GrantLinkJob): Promise<void> {
  console.log(`[scout] Processing grant_links id=${job.id} grant_id=${job.grant_id}`);

  const browser = await launchGrantBrowser();
  const page = await newGrantPage(browser);
  page.setDefaultTimeout(300_000); // 5 min: same as browser defaults for stability

  try {
    const formUrl = await runScoutDiscovery(page, job.homepage_url);

    if (formUrl && formUrl.trim() !== "") {
      await markScoutJobResult(job.id, "found", formUrl);
      await updateGrantApplicationUrl(job.grant_id, formUrl.trim());
      console.log(`[scout] Found form URL for grant ${job.grant_id}: ${formUrl.slice(0, 60)}...`);
    } else {
      await markScoutJobResult(job.id, "manual_review_needed", null, "No application form link identified");
      console.log(`[scout] No form URL found for grant ${job.grant_id}, marked manual_review_needed`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[scout] Error for job ${job.id}:`, msg);
    await markScoutJobResult(job.id, "failed", null, msg.slice(0, 1000));
    if (isApiCreditError(err)) {
      throw new ApiCreditError(msg);
    }
  } finally {
    await browser.close();
  }
}
