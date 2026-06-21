import { NextResponse } from "next/server";
import {
  CLAUDE_DISCOVERY_ENABLE_ENV,
  CLAUDE_DISCOVERY_KEY_ENV,
  GEMINI_DISCOVERY_ENABLE_ENV,
  GEMINI_DISCOVERY_KEY_ENV,
  envNamesList,
  isClaudeGrantDiscoveryEnabled,
  isGeminiGrantDiscoveryEnabled,
} from "@/lib/grants-discovery-provider-config";

type Check = {
  name: string;
  ok: boolean;
  required: boolean;
  detail?: string;
};

const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_KEY",
  "NEXT_PUBLIC_APP_URL",
  "OPENAI_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID",
  "NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID",
  "NEXT_PUBLIC_STRIPE_PRO_PRICE_ID",
  "NEXT_PUBLIC_STRIPE_BUSINESS_PRICE_ID",
];

const RECOMMENDED_ENV = [
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "CRON_SECRET",
  "INTERNAL_API_SECRET",
  "APIFY_TOKEN",
  "PERPLEXITY_API_KEY",
  "ANTHROPIC_API_KEY",
  "CLAUDE_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_AI_API_KEY",
];

function envCheck(name: string, required: boolean): Check {
  return {
    name,
    required,
    ok: Boolean(process.env[name]?.trim()),
  };
}

function anyEnv(names: string[]): boolean {
  return names.some((name) => Boolean(process.env[name]?.trim()));
}

export async function GET(req: Request): Promise<NextResponse> {
  const internalSecret = process.env.INTERNAL_API_SECRET?.trim();
  if (internalSecret && req.headers.get("authorization") !== `Bearer ${internalSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const checks = [
    ...REQUIRED_ENV.map((name) => envCheck(name, true)),
    ...RECOMMENDED_ENV.map((name) => envCheck(name, false)),
    {
      name: "OPENAI_CHECKER_FUNNEL",
      required: true,
      ok: Boolean(process.env.OPENAI_API_KEY?.trim()),
      detail: "Trusted matching, digests, and deadline reminders require OpenAI-scored eligibility assessments.",
    },
    {
      name: "GRANT_DISCOVERY_AI_PROVIDERS",
      required: false,
      ok: anyEnv(["OPENAI_API_KEY", "PERPLEXITY_API_KEY"]) || isClaudeGrantDiscoveryEnabled() || isGeminiGrantDiscoveryEnabled(),
      detail: "Grant discovery uses OpenAI, Perplexity, and optional Claude/Gemini providers when explicitly enabled.",
    },
    {
      name: "CLAUDE_DISCOVERY",
      required: false,
      ok: isClaudeGrantDiscoveryEnabled(),
      detail: `Optional; requires ${envNamesList(CLAUDE_DISCOVERY_KEY_ENV)} plus ${envNamesList(CLAUDE_DISCOVERY_ENABLE_ENV)}.`,
    },
    {
      name: "GEMINI_DISCOVERY",
      required: false,
      ok: isGeminiGrantDiscoveryEnabled(),
      detail: `Optional; requires ${envNamesList(GEMINI_DISCOVERY_KEY_ENV)} plus ${envNamesList(GEMINI_DISCOVERY_ENABLE_ENV)}.`,
    },
    {
      name: "APIFY_SOURCE_DISCOVERY",
      required: false,
      ok: anyEnv(["APIFY_TOKEN"]),
      detail: "The Apify source-discovery cron uses APIFY_TOKEN plus CRON_SECRET and INTERNAL_API_SECRET.",
    },
  ];

  const failedRequired = checks.filter((check) => check.required && !check.ok);
  const status = failedRequired.length > 0 ? "degraded" : "ok";

  return NextResponse.json(
    {
      status,
      checks,
      failedRequired: failedRequired.map((check) => check.name),
    },
    { status: failedRequired.length > 0 ? 503 : 200 }
  );
}
