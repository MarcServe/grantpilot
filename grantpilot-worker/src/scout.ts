/**
 * Scout: find application form URL from a grant programme homepage using Playwright + Claude.
 * Used by the nightly Scout run; updates grant_links and Grant.applicationUrl.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Page } from "playwright";
import { launchGrantBrowser, newGrantPage, navigateToGrantUrl } from "./browser.js";
import { getSupabase } from "./supabase.js";

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const anthropic = new Anthropic({ apiKey: requiredEnv("ANTHROPIC_API_KEY") });

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
      const href = (a as HTMLAnchorElement).href;
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

/** Ask Claude which link is the application form. Returns URL or null. */
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

  // Clean: take first line, strip quotes
  const url = text.split(/\s/)[0].replace(/^["']|["']$/g, "");
  try {
    new URL(url);
    return url;
  } catch {
    return null;
  }
}

/** Run Scout discovery on the current page (and optionally one hop). Returns form URL or null. */
export async function runScoutDiscovery(page: Page, homepageUrl: string): Promise<string | null> {
  const { ok } = await navigateToGrantUrl(page, homepageUrl);
  if (!ok) return null;

  const links = await getPageLinks(page);
  if (links.length === 0) return null;

  let formUrl = await askClaudeForFormUrl(homepageUrl, links);
  if (!formUrl) return null;

  // If the chosen URL is the same as the current page, no hop; otherwise optionally verify with one navigation
  const currentUrl = page.url();
  if (formUrl === currentUrl || formUrl === homepageUrl) return formUrl;

  // One hop: navigate to the candidate and confirm it's a form page (has form elements or known form host)
  try {
    const nav = await page.goto(formUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    if (nav && nav.status() >= 400) return formUrl; // still return it, let DB store it
    const newLinks = await getPageLinks(page);
    // If this page has many form-like links, ask Claude again for the best one; else keep formUrl
    const formHosts = ["airtable.com", "typeform.com", "forms.gle", "docs.google.com/forms"];
    const isFormHost = formHosts.some((h) => formUrl.toLowerCase().includes(h));
    if (isFormHost) return formUrl;
    return page.url(); // use final URL after redirect
  } catch {
    return formUrl;
  }
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
  } finally {
    await browser.close();
  }
}
