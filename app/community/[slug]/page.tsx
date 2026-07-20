import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, ClipboardCheck, Mail, MessageCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  communityAccessUnlocksText,
  findCommunityAccessCodeByToken,
  formatCommunityAccessExpiry,
  normaliseCommunitySlug,
  partnerNameFromSlug,
  validateCommunityAccessCode,
} from "@/lib/community-access";
import { resolvePlanKey } from "@/lib/plan-features";

export const dynamic = "force-dynamic";

type CommunityPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ code?: string; error?: string }>;
};

export default async function CommunityPage({ params, searchParams }: CommunityPageProps) {
  const { slug: rawSlug } = await params;
  const { code: rawCode, error } = await searchParams;
  const slug = normaliseCommunitySlug(rawSlug);
  if (!slug) redirect("/");

  const token = rawCode?.trim() ?? "";
  const partnerName = partnerNameFromSlug(slug);
  const supabase = getSupabaseAdmin();
  const accessCode = token ? await findCommunityAccessCodeByToken(supabase, slug, token) : null;
  const invalid = validateCommunityAccessCode(accessCode);
  const plan = resolvePlanKey(accessCode?.accessPlan ?? accessCode?.access_plan ?? "GROWTH");
  const durationDays = accessCode?.durationDays ?? accessCode?.duration_days ?? 90;
  const redeemBy = accessCode?.redeemBy ?? accessCode?.redeem_by ?? null;
  const user = await getCurrentUser();
  const claimPath = `/community/claim?community=${encodeURIComponent(slug)}&code=${encodeURIComponent(token)}`;
  const ctaHref = user
    ? claimPath
    : `/sign-up?community=${encodeURIComponent(slug)}&code=${encodeURIComponent(token)}`;

  return (
    <main className="min-h-screen bg-[#f4f8ff] text-[#071a3a]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 py-8 sm:px-8 lg:py-12">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3" aria-label="GrantsCopilot home">
            <Image src="/logogc.png" alt="" width={58} height={58} className="h-12 w-12 rounded-xl object-contain" priority />
            <div>
              <div className="text-2xl font-black tracking-tight">
                Grants<span className="text-[#2468e8]">Copilot</span>
              </div>
              <div className="text-xs font-semibold text-[#4f647f]">Grants that come to you</div>
            </div>
          </Link>
          <Link href={user ? "/dashboard" : "/sign-in"}>
            <Button variant="outline">{user ? "Dashboard" : "Sign in"}</Button>
          </Link>
        </header>

        <section className="grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <div className="inline-flex rounded-full bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-800">
              {partnerName} community pilot
            </div>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-6xl">
                Instead of searching for grants, what if the right grants came to you?
              </h1>
              <p className="max-w-2xl text-lg font-medium leading-8 text-[#304966]">
                During our pilot, {partnerName} members can use GrantsCopilot free for {durationDays} days.
                Create your Business DNA once, add your website and funding goals, then GrantsCopilot scans daily
                and sends strong matches by email or WhatsApp.
              </p>
            </div>
            {error && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {error === "claim_failed" ? "We could not apply this community access link. Please check the link and try again." : error}
              </div>
            )}
            {invalid && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                {invalid.message}
              </div>
            )}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href={invalid ? "/sign-up" : ctaHref}>
                <Button size="lg" className="w-full sm:w-auto">
                  {user ? "Claim pilot access" : "Create Business DNA"}
                </Button>
              </Link>
              <Link href="/#how-it-works">
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  See how it works
                </Button>
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">
              {redeemBy ? `Redeem by ${formatCommunityAccessExpiry(redeemBy)}. ` : ""}
              No card required. Mark grants as viewed, deferred, or applied so your opportunities stay clean.
            </p>
          </div>

          <Card className="overflow-hidden border-blue-100 bg-white shadow-[0_24px_80px_rgba(7,26,58,0.12)]">
            <CardContent className="space-y-5 p-6 sm:p-8">
              <div className="rounded-2xl bg-[#071a3a] p-6 text-white">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-200">Pilot access</p>
                <div className="mt-3 text-4xl font-black">{durationDays} days free</div>
                <p className="mt-2 text-sm text-white/72">
                  {partnerName} members get {plan.toLowerCase()}-level access during the pilot.
                </p>
              </div>
              <div className="space-y-3">
                {communityAccessUnlocksText(plan).map((item) => (
                  <div key={item} className="flex gap-3 rounded-lg border bg-muted/20 p-3 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          {[
            { icon: Sparkles, title: "Create Business DNA once", copy: "Describe your company, goals, sector, evidence, and website." },
            { icon: Mail, title: "Daily grant radar", copy: "GrantsCopilot checks fresh grants against your profile every day." },
            { icon: MessageCircle, title: "Strong-match alerts", copy: "Email and WhatsApp alerts focus on 85%+ opportunities." },
            { icon: ClipboardCheck, title: "Keep the list clean", copy: "Mark viewed, deferred, or applied so old matches stop clogging the active list." },
          ].map((item) => (
            <Card key={item.title} className="border-blue-100">
              <CardContent className="space-y-3 p-5">
                <item.icon className="h-5 w-5 text-blue-700" />
                <div className="font-bold">{item.title}</div>
                <p className="text-sm leading-6 text-muted-foreground">{item.copy}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </main>
  );
}
