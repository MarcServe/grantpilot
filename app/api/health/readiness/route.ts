import { NextResponse } from "next/server";

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

  const checks = [
    ...REQUIRED_ENV.map((name) => envCheck(name, true)),
    ...RECOMMENDED_ENV.map((name) => envCheck(name, false)),
    {
      name: "OPENAI_CHECKER_FUNNEL",
      required: true,
      ok: Boolean(process.env.OPENAI_API_KEY?.trim()),
      detail: "Trusted matching, digests, and deadline reminders require OpenAI-scored eligibility assessments.",
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
