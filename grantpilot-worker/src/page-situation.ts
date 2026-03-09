/**
 * Detect page situation after opening a grant URL so we can block fill steps
 * when the user must sign in, use a direct application link, or complete verification.
 */

import type { Page } from "playwright";

export type PageSituation =
  | "login_required"
  | "competition_list"
  | "application_form"
  | "needs_verification"
  | "unknown";

export interface PageSituationResult {
  situation: PageSituation;
  /** Set when situation is competition_list; app can prompt user to set direct URL. */
  needsDirectUrl?: boolean;
}

/**
 * Heuristic detection: login form, competition list, verify/register, or application form.
 * Order: login > verify > list > form > unknown.
 */
export async function detectPageSituation(page: Page): Promise<PageSituationResult> {
  const raw = await page.evaluate(() => {
    const body = document.body?.innerText?.toLowerCase() ?? "";
    const html = document.documentElement?.innerHTML?.toLowerCase() ?? "";

    // Login: password field or strong login signals
    const hasPassword = document.querySelector('input[type="password"]') != null;
    const loginPhrases = [
      "sign in",
      "log in",
      "login",
      "sign in to your account",
      "government gateway",
      "one login",
      "submit your details to sign in",
    ];
    const hasLoginPhrase = loginPhrases.some((p) => body.includes(p) || html.includes(p));
    if (hasPassword || (hasLoginPhrase && body.length < 8000)) {
      return { situation: "login_required" };
    }

    // Verification / create account
    const verifyPhrases = [
      "verify your email",
      "confirm your email",
      "verify your e-mail",
      "create an account",
      "create your account",
      "register for an account",
      "check your inbox",
      "verification link",
      "confirm your email address",
    ];
    if (verifyPhrases.some((p) => body.includes(p) || html.includes(p))) {
      return { situation: "needs_verification" };
    }

    // Application form: meaningful set of fillable fields (not just search/login)
    const inputs = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="password"]), textarea, select'
    );
    const count = inputs.length;
    // If we have several form fields, treat as application form (we can fill)
    if (count >= 3) {
      return { situation: "application_form" };
    }

    // Competition list / portal: list-like content, schemes/competitions wording, few form fields
    const listPhrases = [
      "find a grant",
      "browse competitions",
      "open competitions",
      "current competitions",
      "list of schemes",
      "funding opportunities",
      "apply for funding",
      "view all competitions",
      "search for funding",
    ];
    const hasListPhrase = listPhrases.some((p) => body.includes(p) || html.includes(p));
    const linkCount = document.querySelectorAll('a[href]').length;
    if (hasListPhrase && (count <= 2 || linkCount > 8)) {
      return { situation: "competition_list", needsDirectUrl: true };
    }

    // Multiple links that look like grant/competition cards (e.g. repeated structure)
    const links = Array.from(document.querySelectorAll('a[href]'));
    const hrefs = links.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? "").filter(Boolean);
    const pathLike = hrefs.filter((h) => h.startsWith("/") && h.length > 5).length;
    if (pathLike >= 5 && count <= 2) {
      return { situation: "competition_list", needsDirectUrl: true };
    }

    // Default: 2+ fillable fields treat as form; 0–1 fields treat as unknown and ask for direct URL
    if (count >= 2) {
      return { situation: "application_form" };
    }
    return { situation: "unknown", needsDirectUrl: true };
  });

  const situation = (raw?.situation ?? "unknown") as PageSituation;
  const needsDirectUrl = raw?.needsDirectUrl === true;
  return {
    situation: ["login_required", "competition_list", "application_form", "needs_verification", "unknown"].includes(
      situation
    )
      ? situation
      : "unknown",
    ...(needsDirectUrl ? { needsDirectUrl: true } : {}),
  };
}
