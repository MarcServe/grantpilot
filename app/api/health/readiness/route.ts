import { getAIProviderStatuses } from "@/lib/ai-provider-settings";
import { AI_PROVIDERS, type AIProvider } from "@/lib/ai-provider-catalog";
import { NextResponse } from "next/server";
import {
  CLAUDE_DISCOVERY_ENABLE_ENV,
  CLAUDE_DISCOVERY_KEY_ENV,
  GEMINI_DISCOVERY_ENABLE_ENV,
  GEMINI_DISCOVERY_KEY_ENV,
  envNamesList,
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


export async function GET(req: Request): Promise<NextResponse> {
  const internalSecret = process.env.INTERNAL_API_SECRET?.trim();
  if (internalSecret && req.headers.get("authorization") !== `Bearer ${internalSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const providerState = await getAIProviderStatuses().catch(() => null);
  const configured = (provider: AIProvider) => Boolean(providerState?.providers.find((item) => item.provider === provider)?.configured);
  const enabled = (provider: AIProvider) => Boolean(providerState?.providers.find((item) => item.provider === provider)?.enabled && configured(provider));
  const checks = [
    ...REQUIRED_ENV.map((name) => envCheck(name, true)),
    ...RECOMMENDED_ENV.map((name) => envCheck(name, false)),
    {
      name: "OPENAI_CHECKER_FUNNEL",
      required: true,
      ok: configured("openai"),
      detail: "Trusted matching, digests, and deadline reminders require OpenAI-scored eligibility assessments.",
    },
    {
      name: "GRANT_DISCOVERY_AI_PROVIDERS",
      required: false,
      ok: enabled("openai") || enabled("perplexity") || enabled("claude") || enabled("gemini"),
      detail: "Grant discovery uses OpenAI, Perplexity, and optional Claude/Gemini providers when explicitly enabled.",
    },
    {
      name: "CLAUDE_DISCOVERY",
      required: false,
      ok: enabled("claude"),
      detail: `Configure and enable in Admin, or set ${envNamesList(CLAUDE_DISCOVERY_KEY_ENV)} plus ${envNamesList(CLAUDE_DISCOVERY_ENABLE_ENV)}.`,
    },
    {
      name: "GEMINI_DISCOVERY",
      required: false,
      ok: enabled("gemini"),
      detail: `Configure and enable in Admin, or set ${envNamesList(GEMINI_DISCOVERY_KEY_ENV)} plus ${envNamesList(GEMINI_DISCOVERY_ENABLE_ENV)}.`,
    },
    {
      name: "APIFY_SOURCE_DISCOVERY",
      required: false,
      ok: enabled("apify"),
      detail: "The Apify source-discovery cron uses APIFY_TOKEN plus CRON_SECRET and INTERNAL_API_SECRET.",
    },
  ];

  for (const check of checks) {
    const provider = (Object.entries(AI_PROVIDERS) as Array<[AIProvider, { keyEnv: readonly string[] }]>).find(([, meta]) => meta.keyEnv.includes(check.name));
    if (provider) check.ok = configured(provider[0]);
  }
  checks.push({ name: "AI_PROVIDER_SETTINGS", required: true, ok: Boolean(providerState), detail: "Admin-managed keys take precedence over environment keys." });
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
