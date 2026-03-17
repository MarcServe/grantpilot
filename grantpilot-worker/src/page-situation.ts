/**
 * Detect page situation after opening a grant URL so we can block fill steps
 * when the user must sign in, use a direct application link, or complete verification.
 * Uses vision (screenshot + Claude) first; falls back to DOM heuristics on API failure.
 */

import Anthropic from "@anthropic-ai/sdk";
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

const VALID_SITUATIONS: PageSituation[] = [
  "login_required",
  "competition_list",
  "application_form",
  "needs_verification",
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
- login_required: sign-in / log-in form, password field, or gateway
- needs_verification: email verification, create account, confirm email, check inbox
- competition_list: list of schemes, competitions, or funding opportunities (user should open a specific grant and use direct application URL)
- application_form: actual grant application form with multiple fillable fields
- unknown: none of the above or unclear

If the page is a competition list or portal (multiple grants/schemes), set needsDirectUrl to true so the user is asked to provide the direct application URL.

Return ONLY a JSON object with two keys: "situation" (one of the strings above) and "needsDirectUrl" (boolean, true only for competition_list or when the user must open a specific application page). No markdown.`;

  try {
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
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
    const parsed = JSON.parse(jsonStr) as { situation?: string; needsDirectUrl?: boolean };
    const situation = parsed.situation as string | undefined;
    if (!situation || !VALID_SITUATIONS.includes(situation as PageSituation)) {
      return null;
    }
    return {
      situation: situation as PageSituation,
      ...(parsed.needsDirectUrl === true ? { needsDirectUrl: true } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Heuristic detection: login form, competition list, verify/register, or application form.
 * Order: login > verify > list > form > unknown.
 */
function detectPageSituationHeuristic(raw: {
  situation?: string;
  needsDirectUrl?: boolean;
}): PageSituationResult {
  const situation = (raw?.situation ?? "unknown") as PageSituation;
  const needsDirectUrl = raw?.needsDirectUrl === true;
  return {
    situation: VALID_SITUATIONS.includes(situation) ? situation : "unknown",
    ...(needsDirectUrl ? { needsDirectUrl: true } : {}),
  };
}

/**
 * Detect page situation: vision-first, then fall back to DOM heuristics.
 */
export async function detectPageSituation(page: Page): Promise<PageSituationResult> {
  const visionResult = await detectPageSituationWithVision(page);
  if (visionResult) return visionResult;

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

  return detectPageSituationHeuristic(raw as { situation?: string; needsDirectUrl?: boolean });
}
