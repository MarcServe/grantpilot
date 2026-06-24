export type ApplicationUrlKind =
  | "direct_form"
  | "portal_application"
  | "specific_grant_page"
  | "generic_listing"
  | "account_registration"
  | "closed_or_expired"
  | "dead_link"
  | "unknown";

export type ApplicationUrlQuality =
  | "verified_direct"
  | "verified_portal"
  | "needs_scout"
  | "manual_review"
  | "rejected"
  | "unknown";

export type ApplicationUrlClassification = {
  kind: ApplicationUrlKind;
  quality: ApplicationUrlQuality;
  confidence: number;
  reason: string;
};

const FORM_HOST_PATTERNS = [
  /(^|\.)airtable\.com$/i,
  /(^|\.)typeform\.com$/i,
  /^forms\.gle$/i,
  /^docs\.google\.com$/i,
  /(^|\.)jotform\.com$/i,
  /(^|\.)submittable\.com$/i,
  /(^|\.)smartsheet\.com$/i,
  /(^|\.)formstack\.com$/i,
  /(^|\.)cognitoforms\.com$/i,
  /(^|\.)apply\.grantium\.artscouncil\.org\.uk$/i,
];

const PORTAL_HOST_PATTERNS = [
  /(^|\.)apply-for-innovation-funding\.service\.gov\.uk$/i,
  /^apply\./i,
  /^application\./i,
];

const GENERIC_PATH_SEGMENTS = new Set([
  "advice",
  "business",
  "business-finance",
  "business-support",
  "business-support-advice",
  "for-business",
  "for-businesses",
  "funding",
  "grant",
  "grants",
  "information-for-businesses",
  "opportunities",
  "schemes",
  "search",
  "support",
]);

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

export function isVerifiedApplicationQuality(quality?: string | null): boolean {
  return quality === "verified_direct" || quality === "verified_portal";
}

function safeUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function directFormClassification(reason: string, confidence = 95): ApplicationUrlClassification {
  return { kind: "direct_form", quality: "verified_direct", confidence, reason };
}

function portalClassification(reason: string, confidence = 85): ApplicationUrlClassification {
  return { kind: "portal_application", quality: "verified_portal", confidence, reason };
}

export function classifyGrantApplicationUrl(rawUrl: string): ApplicationUrlClassification {
  const url = safeUrl(rawUrl);
  if (!url) {
    return { kind: "dead_link", quality: "rejected", confidence: 100, reason: "Invalid URL" };
  }

  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase().replace(/\/+$/, "");
  const segments = path.split("/").filter(Boolean);

  if (FORM_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
    return directFormClassification("Known hosted form provider");
  }

  if (PORTAL_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
    return portalClassification("Known application portal host");
  }

  if (/\/(apply|application|applications|submit|start-application)(\/|$)/i.test(path)) {
    return portalClassification("Apply/application URL path");
  }

  if (segments.length <= 1 && GENERIC_PATH_SEGMENTS.has(segments[0] ?? "")) {
    return { kind: "generic_listing", quality: "rejected", confidence: 90, reason: "Generic funder/listing page" };
  }

  if (segments.length <= 2 && segments.some((segment) => GENERIC_PATH_SEGMENTS.has(segment))) {
    return {
      kind: "generic_listing",
      quality: "manual_review",
      confidence: 70,
      reason: "Likely listing page, not a specific application form",
    };
  }

  return {
    kind: "specific_grant_page",
    quality: "needs_scout",
    confidence: 55,
    reason: "Specific grant/detail page needs direct form discovery",
  };
}

export function classifyGrantPageText(input: {
  url: string;
  title?: string | null;
  bodyText: string;
  now?: Date;
}): ApplicationUrlClassification {
  const text = `${input.title ?? ""} ${input.bodyText}`.replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();
  const now = input.now ?? new Date();

  if (/account has been successfully created|activate your account|confirmation email/i.test(text)) {
    return {
      kind: "account_registration",
      quality: "manual_review",
      confidence: 90,
      reason: "Account creation/activation step, not a grant application form",
    };
  }

  const dateMatches = [
    ...text.matchAll(
      /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(20\d{2})\b/gi
    ),
  ];
  for (const match of dateMatches) {
    const day = Number(match[1]);
    const month = MONTH_INDEX[match[2].toLowerCase()];
    const year = Number(match[3]);
    if (typeof month !== "number") continue;

    const date = new Date(year, month, day);
    const index = match.index ?? 0;
    const window = lower.slice(Math.max(0, index - 100), index + 140);
    const deadlineSignal = /apply\b.*\bby|applications? close|deadline|submit\b.*\bby|closing date/.test(window);
    if (deadlineSignal && date.getTime() < now.getTime()) {
      return {
        kind: "closed_or_expired",
        quality: "rejected",
        confidence: 95,
        reason: `Past application deadline detected: ${match[0]}`,
      };
    }
  }

  if (/applications? (are|is|have|has) (now )?(closed|ended)|no longer accepting|deadline has passed/i.test(text)) {
    return {
      kind: "closed_or_expired",
      quality: "rejected",
      confidence: 90,
      reason: "Closed/expired wording detected",
    };
  }

  return classifyGrantApplicationUrl(input.url);
}

export function shouldExposeApplyCta(input: { quality?: string | null }): boolean {
  return isVerifiedApplicationQuality(input.quality);
}
