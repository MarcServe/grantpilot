/**
 * Scout: find application form URL from a grant programme homepage.
 *
 * Three modes — resolved in order:
 *   1) Database row worker_settings.scout_mode (set from Admin UI), else
 *   2) SCOUT_MODE env var on the worker (default "full")
 *   "off"   — skip all scouting
 *   "regex" — Playwright + regex/heuristic only (free, no LLM)
 *   "full"  — regex first, then Gemini Flash for vision+text analysis (free tier)
 *
 * Claude is NOT used here — it's reserved for the application process.
 */

import { GoogleGenAI } from "@google/genai";
import type { Page } from "playwright";
import { launchGrantBrowser, newGrantPage, navigateToGrantUrl } from "./browser.js";
import { getSupabase } from "./supabase.js";

// ---------------------------------------------------------------------------
// Scout mode
// ---------------------------------------------------------------------------

export type ScoutMode = "off" | "regex" | "full";

export function getScoutMode(): ScoutMode {
  const raw = (process.env.SCOUT_MODE ?? "full").toLowerCase().trim();
  if (raw === "off" || raw === "regex" || raw === "full") return raw;
  return "full";
}

function parseScoutModeDb(raw: string | null | undefined): ScoutMode | null {
  const v = (raw ?? "").toLowerCase().trim();
  if (v === "off" || v === "regex" || v === "full") return v;
  return null;
}

/**
 * Effective scout mode: Admin UI (worker_settings) overrides env. Falls back to getScoutMode().
 */
export async function resolveScoutMode(): Promise<ScoutMode> {
  try {
    const { data, error } = await getSupabase()
      .from("worker_settings")
      .select("value")
      .eq("key", "scout_mode")
      .maybeSingle();
    if (error) {
      console.warn("[scout] worker_settings read:", error.message);
      return getScoutMode();
    }
    const row = data as { value?: string } | null;
    const parsed = parseScoutModeDb(row?.value);
    if (parsed) return parsed;
  } catch (e) {
    console.warn("[scout] resolveScoutMode:", e);
  }
  return getScoutMode();
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SCOUT_HOPS = 3;
const FORM_HOSTS = [
  "airtable.com", "typeform.com", "forms.gle", "docs.google.com/forms",
  "smartsheet.com", "jotform.com", "surveymonkey.com", "wufoo.com",
  "cognitoforms.com", "formstack.com",
];
const APPLY_LINK_TEXT = /apply|start\s*(?:your)?\s*application|begin\s*application|open\s*form|apply\s*now|start\s*application|submit\s*application|apply\s*here|application\s*form/i;

// ---------------------------------------------------------------------------
// Gemini Flash client (lazy, free tier)
// ---------------------------------------------------------------------------

let _gemini: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI | null {
  if (_gemini) return _gemini;
  const key = (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY)?.trim();
  if (!key) return null;
  _gemini = new GoogleGenAI({ apiKey: key });
  return _gemini;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GrantLinkJob {
  id: number;
  grant_id: string;
  homepage_url: string;
  grant_name: string | null;
  funder: string | null;
  status: string;
}

export interface ApplyButtonCandidate {
  text: string;
  id: string | null;
  name: string | null;
  tagName: string;
}

type ScoutCandidate = {
  url: string;
  kind:
    | "direct_form"
    | "portal_application"
    | "specific_grant_page"
    | "generic_listing"
    | "account_registration"
    | "closed_or_expired"
    | "dead_link"
    | "unknown";
  quality: "verified_direct" | "verified_portal" | "needs_scout" | "manual_review" | "rejected" | "unknown";
  confidence: number;
  reason: string;
};

function isVerifiedScoutCandidate(candidate: ScoutCandidate | null | undefined): boolean {
  return candidate?.quality === "verified_direct" || candidate?.quality === "verified_portal";
}

function rejectedScoutCandidate(url: string, kind: ScoutCandidate["kind"], reason: string): ScoutCandidate {
  return { url, kind, quality: "rejected", confidence: 90, reason };
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

export async function getNextScoutJob(): Promise<GrantLinkJob | null> {
  const { data: rows, error } = await getSupabase()
    .from("grant_links")
    .select("id, grant_id, homepage_url, grant_name, funder, status")
    .eq("status", "pending")
    .order("id", { ascending: true })
    .limit(1);

  if (error || !rows?.length) return null;

  const row = rows[0] as GrantLinkJob;
  const { error: updateErr } = await getSupabase()
    .from("grant_links")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", row.id);

  if (updateErr) return null;
  return { ...row, status: "running" };
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

export async function updateGrantDirectApplicationUrl(grantId: string, candidate: ScoutCandidate): Promise<void> {
  const verified = isVerifiedScoutCandidate(candidate);
  const patch: Record<string, unknown> = {
    directApplicationUrl: verified ? candidate.url : null,
    applicationUrlKind: candidate.kind,
    applicationUrlQuality: candidate.quality,
    applicationUrlConfidence: candidate.confidence,
    applicationUrlVerifiedAt: verified ? new Date().toISOString() : null,
    applicationUrlQualityReason: candidate.reason,
    updatedAt: new Date().toISOString(),
  };
  if (verified) patch.applicationUrl = candidate.url;

  await getSupabase()
    .from("Grant")
    .update(patch)
    .eq("id", grantId);
}

// ---------------------------------------------------------------------------
// DOM helpers (Playwright, no LLM)
// ---------------------------------------------------------------------------

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
      } catch { return; }
      const text = (a as HTMLAnchorElement).textContent?.replace(/\s+/g, " ").trim().slice(0, 120) ?? "";
      out.push({ href, text });
    });
    return out;
  });
}

async function getApplyCandidates(page: Page): Promise<{ links: { href: string; text: string }[]; buttons: ApplyButtonCandidate[] }> {
  const links = await getPageLinks(page);
  const applyLinks = links.filter((l) => APPLY_LINK_TEXT.test(l.text));
  const buttons = await page.evaluate((pattern: string) => {
    const re = new RegExp(pattern, "i");
    const out: { text: string; id: string | null; name: string | null; tagName: string }[] = [];
    document.querySelectorAll("button, input[type='submit'], input[type='button'], a[href], [role='button']").forEach((el) => {
      const tag = (el as HTMLElement).tagName.toLowerCase();
      const text = ((el as HTMLElement).textContent ?? (el as HTMLInputElement).value ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
      if (!text || !re.test(text)) return;
      if (/\bsubmit\b/i.test(text) && !/apply|start\s*application/i.test(text)) return;
      const href = (el as HTMLAnchorElement).href;
      if (href && (tag === "a" || (el as HTMLAnchorElement).tagName === "A")) return;
      out.push({ text, id: (el as HTMLElement).id || null, name: (el as HTMLInputElement).name || null, tagName: tag });
    });
    return out;
  }, APPLY_LINK_TEXT.source);
  return { links: applyLinks, buttons };
}

async function isFormLikePage(page: Page): Promise<boolean> {
  const url = page.url().toLowerCase();
  if (FORM_HOSTS.some((h) => url.includes(h))) return true;
  const count = await page.evaluate(() => {
    return document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select").length;
  });
  return count >= 3;
}

async function validateFinalCandidate(page: Page, candidateUrl: string): Promise<ScoutCandidate> {
  try {
    const current = page.url() || candidateUrl;
    const url = current || candidateUrl;
    const lowerUrl = url.toLowerCase();
    const visibleFields = await page.evaluate(() =>
      document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select").length
    ).catch(() => 0);
    const title = await page.title().catch(() => "");
    const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    const lower = `${title} ${bodyText}`.toLowerCase();

    if (FORM_HOSTS.some((h) => lowerUrl.includes(h))) {
      return { url, kind: "direct_form", quality: "verified_direct", confidence: 95, reason: "Known hosted form provider" };
    }
    if (visibleFields >= 3) {
      return { url, kind: "direct_form", quality: "verified_direct", confidence: 95, reason: "Page contains application form fields" };
    }
    if (/account has been successfully created|activate your account|thank you/i.test(lower)) {
      return { url, kind: "account_registration", quality: "manual_review", confidence: 90, reason: "Account registration/activation step detected" };
    }
    if (/applications? (are|is|have|has) (now )?(closed|ended)|no longer accepting|deadline has passed/i.test(lower)) {
      return rejectedScoutCandidate(url, "closed_or_expired", "Closed/expired wording detected");
    }
    if (/login|sign in|create account|register/i.test(lower) && /application|apply|loan|grant|funding/i.test(lower)) {
      return { url, kind: "portal_application", quality: "verified_portal", confidence: 75, reason: "Official portal start/login page detected" };
    }
    if (/^https?:\/\/apply\./i.test(url) || /\/(apply|application|applications|start-application)(\/|$|\?)/i.test(lowerUrl)) {
      return { url, kind: "portal_application", quality: "verified_portal", confidence: 75, reason: "Apply/application URL pattern verified" };
    }

    return {
      url,
      kind: "specific_grant_page",
      quality: "needs_scout",
      confidence: 55,
      reason: "Candidate did not expose form fields or portal proof",
    };
  } catch {
    return { url: candidateUrl, kind: "unknown", quality: "manual_review", confidence: 30, reason: "Candidate validation failed" };
  }
}

function escapeCssId(id: string): string {
  return id.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

async function clickApplyButton(page: Page, button: ApplyButtonCandidate): Promise<boolean> {
  if (button.id) {
    try {
      await page.locator(`#${escapeCssId(button.id)}`).first().click();
      await Promise.race([page.waitForLoadState("domcontentloaded").catch(() => {}), page.waitForTimeout(3000)]);
      return true;
    } catch { /* fallback */ }
  }
  if (button.name && (button.tagName === "input" || button.tagName === "button")) {
    try {
      const nameEsc = button.name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      await page.locator(`${button.tagName}[name="${nameEsc}"]`).first().click();
      await Promise.race([page.waitForLoadState("domcontentloaded").catch(() => {}), page.waitForTimeout(3000)]);
      return true;
    } catch { /* fallback */ }
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
    } catch { return false; }
  }
}

// ---------------------------------------------------------------------------
// Tier 1: Regex-only link scoring (no LLM, free)
// ---------------------------------------------------------------------------

/**
 * Score a link by how likely it leads to an application form.
 * Higher = better. Returns 0 if no signal.
 */
function scoreLinkAsFormUrl(href: string, text: string): number {
  const lhref = href.toLowerCase();
  const ltext = text.toLowerCase();
  let score = 0;

  if (FORM_HOSTS.some((h) => lhref.includes(h))) score += 50;
  if (/\bapply\b/.test(ltext)) score += 20;
  if (/\bapplication\s*form\b/.test(ltext)) score += 30;
  if (/\bapply\s*now\b/.test(ltext)) score += 25;
  if (/\bstart\s*(your\s*)?application\b/.test(ltext)) score += 25;
  if (/\bapply\s*here\b/.test(ltext)) score += 20;
  if (/\bopen\s*form\b/.test(ltext)) score += 20;
  if (/\bapply\s*online\b/.test(ltext)) score += 20;
  if (/\bsubmit\s*application\b/.test(ltext)) score += 15;

  if (/\/apply(\/|$|\?)/.test(lhref)) score += 15;
  if (/\/application(\/|$|\?)/.test(lhref)) score += 10;
  if (/\/register(\/|$|\?)/.test(lhref)) score += 5;

  // Penalise obviously non-form links
  if (/\b(terms|privacy|contact|about|faq|help|news|blog)\b/.test(ltext)) score -= 30;
  if (/\b(sign.?in|log.?in|create.?account)\b/.test(ltext)) score -= 10;

  return Math.max(0, score);
}

/**
 * Regex-only discovery: find the best "Apply" link using heuristics.
 * Returns a URL or null.
 */
async function regexFindFormUrl(page: Page): Promise<string | null> {
  const links = await getPageLinks(page);
  if (links.length === 0) return null;

  const scored = links
    .map((l) => ({ ...l, score: scoreLinkAsFormUrl(l.href, l.text) }))
    .filter((l) => l.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.length > 0 ? scored[0].href : null;
}

// ---------------------------------------------------------------------------
// Tier 2: Gemini Flash analysis (free tier, text + vision)
// ---------------------------------------------------------------------------

async function askGeminiForFormUrl(
  pageUrl: string,
  links: { href: string; text: string }[]
): Promise<string | null> {
  const gemini = getGemini();
  if (!gemini) return null;

  const linkList = links
    .slice(0, 80)
    .map((l) => `${l.href} (text: "${l.text}")`)
    .join("\n");

  const prompt = `You are a grant research agent. This is a grant programme page.

Page URL: ${pageUrl}

Links from the page:
${linkList}

Identify the SINGLE link that goes to the application form or "Apply now" page (e.g. Airtable, Typeform, Google Form, or the funder's application page). Ignore general info, terms, contact, or overview links.

Reply with ONLY the full URL, or NOT_FOUND. No quotes or explanation.`;

  try {
    const res = await gemini.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });
    const text = typeof (res as { text?: string }).text === "string"
      ? (res as { text: string }).text.trim()
      : "";
    if (!text || text.toUpperCase() === "NOT_FOUND") return null;
    const url = text.split(/\s/)[0].replace(/^["']|["']$/g, "");
    try { new URL(url); return url; } catch { return null; }
  } catch {
    return null;
  }
}

async function askGeminiForFormUrlWithVision(page: Page, pageUrl: string): Promise<string | null> {
  const gemini = getGemini();
  if (!gemini) return null;

  let screenshotBase64: string;
  try {
    const buf = await page.screenshot({ type: "jpeg", fullPage: false, quality: 70 });
    screenshotBase64 = buf.toString("base64");
  } catch { return null; }

  const prompt = `Look at this screenshot of a grant programme webpage (URL: ${pageUrl}).

Identify the link or button that goes to the APPLICATION FORM or "Apply now" page. Ignore general info, terms, contact, or overview links.

Reply with ONLY the full URL, or NOT_FOUND. No quotes or explanation.`;

  try {
    const res = await gemini.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: screenshotBase64 } },
            { text: prompt },
          ],
        },
      ],
    });
    const text = typeof (res as { text?: string }).text === "string"
      ? (res as { text: string }).text.trim()
      : "";
    if (!text || text.toUpperCase() === "NOT_FOUND") return null;
    const url = text.split(/\s/)[0].replace(/^["']|["']$/g, "");
    try { new URL(url); return url; } catch { return null; }
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Gemini vision page health validation (is this a live grant page?)
// ---------------------------------------------------------------------------

export type PageHealthStatus = "live" | "dead" | "expired" | "unknown";

export interface GeminiPageHealthResult {
  status: PageHealthStatus;
  reason: string;
}

export async function validatePageWithGeminiVision(
  page: Page,
  pageUrl: string
): Promise<GeminiPageHealthResult> {
  const gemini = getGemini();
  if (!gemini) return { status: "unknown", reason: "No Gemini API key configured" };

  let screenshotBase64: string;
  try {
    const buf = await page.screenshot({ type: "jpeg", fullPage: false, quality: 60 });
    screenshotBase64 = buf.toString("base64");
  } catch {
    return { status: "unknown", reason: "Failed to capture screenshot" };
  }

  const prompt = `Analyze this screenshot of a webpage (URL: ${pageUrl}).

Classify the page into exactly ONE category:
- LIVE_GRANT — This is a real, active grant/funding opportunity page with details about the programme, eligibility, or an application form
- DEAD — This is a 404 page, "page not found", error page, generic homepage, search results page, or completely unrelated to grants
- EXPIRED — This page describes a grant that has CLOSED, ended, or is no longer accepting applications (look for "closed", "ended", "deadline passed", etc.)

Reply with ONLY one word: LIVE_GRANT, DEAD, or EXPIRED. No explanation.`;

  try {
    const res = await gemini.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: screenshotBase64 } },
            { text: prompt },
          ],
        },
      ],
    });
    const text = (typeof (res as { text?: string }).text === "string"
      ? (res as { text: string }).text
      : "").trim().toUpperCase();

    if (text.includes("LIVE_GRANT")) return { status: "live", reason: "Gemini confirmed live grant page" };
    if (text.includes("EXPIRED")) return { status: "expired", reason: "Gemini detected expired/closed programme" };
    if (text.includes("DEAD")) return { status: "dead", reason: "Gemini detected dead/404/unrelated page" };
    return { status: "unknown", reason: `Gemini response unclear: ${text.slice(0, 60)}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "unknown", reason: `Gemini error: ${msg.slice(0, 100)}` };
  }
}

// ---------------------------------------------------------------------------
// Discovery orchestrator
// ---------------------------------------------------------------------------

export async function runScoutDiscovery(page: Page, homepageUrl: string, mode: ScoutMode, skipInitialNav = false): Promise<ScoutCandidate | null> {
  if (!skipInitialNav) {
    const { ok } = await navigateToGrantUrl(page, homepageUrl);
    if (!ok) return null;
  }

  let lastCandidate: ScoutCandidate | null = null;
  const useGemini = mode === "full";

  for (let hop = 0; hop < MAX_SCOUT_HOPS; hop++) {
    const currentUrl = page.url();

    if (await isFormLikePage(page)) return validateFinalCandidate(page, currentUrl);

    // --- Tier 1: regex scoring ---
    const regexUrl = await regexFindFormUrl(page);
    if (regexUrl) {
      lastCandidate = { url: regexUrl, kind: "unknown", quality: "manual_review", confidence: 45, reason: "Regex candidate not yet validated" };
      if (regexUrl === currentUrl || regexUrl === homepageUrl) return validateFinalCandidate(page, regexUrl);
      try {
        const nav = await page.goto(regexUrl, { waitUntil: "domcontentloaded", timeout: 300_000 });
        if (nav && nav.status() >= 400) return rejectedScoutCandidate(regexUrl, "dead_link", `HTTP ${nav.status()} for candidate`);
        const candidate = await validateFinalCandidate(page, regexUrl);
        if (isVerifiedScoutCandidate(candidate)) return candidate;
        lastCandidate = candidate;
      } catch {
        return { url: regexUrl, kind: "unknown", quality: "manual_review", confidence: 40, reason: "Candidate navigation failed" };
      }
    }

    // --- Tier 2: Gemini Flash (only in "full" mode) ---
    if (useGemini) {
      let formUrl: string | null = null;
      try {
        formUrl = await askGeminiForFormUrlWithVision(page, currentUrl);
      } catch {
        const links = await getPageLinks(page);
        if (links.length > 0) formUrl = await askGeminiForFormUrl(currentUrl, links);
      }

      if (formUrl) {
        lastCandidate = { url: formUrl, kind: "unknown", quality: "manual_review", confidence: 45, reason: "Gemini candidate not yet validated" };
        if (formUrl === currentUrl || formUrl === homepageUrl) return validateFinalCandidate(page, formUrl);
        try {
          const nav = await page.goto(formUrl, { waitUntil: "domcontentloaded", timeout: 300_000 });
          if (nav && nav.status() >= 400) return rejectedScoutCandidate(formUrl, "dead_link", `HTTP ${nav.status()} for candidate`);
          const candidate = await validateFinalCandidate(page, formUrl);
          if (isVerifiedScoutCandidate(candidate)) return candidate;
          lastCandidate = candidate;
        } catch {
          return { url: formUrl, kind: "unknown", quality: "manual_review", confidence: 40, reason: "Candidate navigation failed" };
        }
      }
    }

    // --- Fallback: follow Apply links / click Apply buttons ---
    const { links: applyLinks, buttons: applyButtons } = await getApplyCandidates(page);

    const applyLink = applyLinks.find((l) => FORM_HOSTS.some((h) => l.href.toLowerCase().includes(h)))
      ?? applyLinks[0];
    if (applyLink) {
      try {
        await page.goto(applyLink.href, { waitUntil: "domcontentloaded", timeout: 300_000 });
        await page.waitForTimeout(2000);
        const candidate = await validateFinalCandidate(page, applyLink.href);
        if (isVerifiedScoutCandidate(candidate)) return candidate;
        lastCandidate = candidate;
        continue;
      } catch {
        lastCandidate = { url: applyLink.href, kind: "unknown", quality: "manual_review", confidence: 40, reason: "Apply link navigation failed" };
      }
    }

    if (applyButtons.length > 0) {
      const clicked = await clickApplyButton(page, applyButtons[0]);
      if (clicked) {
        await page.waitForTimeout(2000);
        const candidate = await validateFinalCandidate(page, page.url());
        if (isVerifiedScoutCandidate(candidate)) return candidate;
        lastCandidate = candidate;
        continue;
      }
    }

    if (lastCandidate) return lastCandidate;
    break;
  }

  return lastCandidate;
}

// ---------------------------------------------------------------------------
// Main entry: process one scout job
// ---------------------------------------------------------------------------

/**
 * Update the Grant table's url_status and url_checked_at.
 */
async function updateGrantUrlStatus(grantId: string, status: PageHealthStatus): Promise<void> {
  await getSupabase()
    .from("Grant")
    .update({ url_status: status, url_checked_at: new Date().toISOString() })
    .eq("id", grantId);
}

export async function processScoutJob(job: GrantLinkJob): Promise<void> {
  const mode = await resolveScoutMode();
  console.log(`[scout] Processing grant_links id=${job.id} grant_id=${job.grant_id} mode=${mode}`);

  const browser = await launchGrantBrowser();
  const page = await newGrantPage(browser);
  page.setDefaultTimeout(300_000);

  try {
    const nav = await navigateToGrantUrl(page, job.homepage_url);
    if (!nav.ok) {
      await updateGrantUrlStatus(job.grant_id, "dead");
      await updateGrantDirectApplicationUrl(
        job.grant_id,
        rejectedScoutCandidate(job.homepage_url, "dead_link", `Navigation failed: ${nav.error ?? "unknown"}`)
      );
      await markScoutJobResult(job.id, "failed", null, `Navigation failed: ${nav.error ?? "unknown"}`);
      console.log(`[scout] Navigation failed for grant ${job.grant_id}, marked dead`);
      return;
    }

    if (nav.status && (nav.status === 404 || nav.status === 410)) {
      await updateGrantUrlStatus(job.grant_id, "dead");
      await updateGrantDirectApplicationUrl(
        job.grant_id,
        rejectedScoutCandidate(job.homepage_url, "dead_link", `HTTP ${nav.status}`)
      );
      await markScoutJobResult(job.id, "failed", null, `HTTP ${nav.status}`);
      console.log(`[scout] HTTP ${nav.status} for grant ${job.grant_id}, marked dead`);
      return;
    }

    if (mode === "full") {
      const health = await validatePageWithGeminiVision(page, page.url());
      console.log(`[scout] Gemini health check for grant ${job.grant_id}: ${health.status} — ${health.reason}`);
      await updateGrantUrlStatus(job.grant_id, health.status);

      if (health.status === "dead") {
        await updateGrantDirectApplicationUrl(
          job.grant_id,
          rejectedScoutCandidate(job.homepage_url, "dead_link", health.reason)
        );
        await markScoutJobResult(job.id, "failed", null, health.reason);
        return;
      }
      if (health.status === "expired") {
        await updateGrantDirectApplicationUrl(
          job.grant_id,
          rejectedScoutCandidate(job.homepage_url, "closed_or_expired", health.reason)
        );
        await markScoutJobResult(job.id, "manual_review_needed", null, health.reason);
        return;
      }
    }

    const candidate = await runScoutDiscovery(page, job.homepage_url, mode, true);

    if (candidate && isVerifiedScoutCandidate(candidate)) {
      await markScoutJobResult(job.id, "found", candidate.url);
      await updateGrantDirectApplicationUrl(job.grant_id, candidate);
      if (mode !== "full") await updateGrantUrlStatus(job.grant_id, "live");
      console.log(`[scout] Found verified form URL for grant ${job.grant_id}: ${candidate.url.slice(0, 60)}...`);
    } else {
      const reason = candidate?.reason ?? "No verified direct application form or official portal start link identified";
      await markScoutJobResult(job.id, "manual_review_needed", candidate?.url ?? null, reason);
      await updateGrantDirectApplicationUrl(job.grant_id, candidate ?? {
        url: job.homepage_url,
        kind: "unknown",
        quality: "manual_review",
        confidence: 0,
        reason,
      });
      console.log(`[scout] No verified form URL found for grant ${job.grant_id}, marked manual_review_needed`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[scout] Error for job ${job.id}:`, msg);
    await markScoutJobResult(job.id, "failed", null, msg.slice(0, 1000));
    if (isApiCreditError(err)) throw new ApiCreditError(msg);
  } finally {
    await browser.close();
  }
}
