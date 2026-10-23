import { ProfileOpportunityPreview } from "@/components/profile/profile-opportunity-preview";
import {
  criteriaProfileCompletionScore,
  profileCompletionFields,
} from "@/lib/profile-completion";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { Bell } from "lucide-react";
import { UserNav } from "@/components/layout/user-nav";
import { DashboardNav } from "@/components/layout/dashboard-nav";
import { getActiveOrg } from "@/lib/auth";
import { PLAN_LIMITS } from "@/lib/plans";
import { resolveEffectivePlanForOrg } from "@/lib/plan-features";

export const dynamic = "force-dynamic";

function preferredAccountName(
  org: Awaited<ReturnType<typeof getActiveOrg>>["org"],
): string | null {
  const profileName = org.profiles?.[0]?.businessName?.trim();
  return profileName || org.name?.trim() || null;
}

async function loadAccountNavData() {
  const { org, activeProfileId } = await getActiveOrg();
  const plan = resolveEffectivePlanForOrg(org);
  return {
    accountName: preferredAccountName(org),
    activeProfileId,
    profileLimit: PLAN_LIMITS[plan].profiles,
    profiles: (org.profiles ?? []).map((profile) => ({
      id: profile.id,
      businessName: profile.businessName ?? null,
      completionScore: Number(
        profile.completionScore ?? profile.completion_score ?? 0,
      ),
    })),
  };
}

async function SidebarNavWithProfileStrength() {
  const { org } = await getActiveOrg();
  const profile = org.profiles?.[0];
  const profileStrength = profile ? criteriaProfileCompletionScore(profile) : 0;

  return <DashboardNav profileStrength={profileStrength} placement="sidebar" />;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const accountNavPromise = loadAccountNavData().catch(() => null);

  return (
    <div className="min-h-screen bg-[#f4f8ff] text-[#071a3a]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden h-screen max-h-screen w-[250px] flex-col overflow-hidden bg-[#041d38] px-5 py-7 text-white lg:flex">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-3"
          aria-label="GrantsCopilot home"
        >
          <Image
            src="/logogc.png"
            alt=""
            width={58}
            height={58}
            className="h-12 w-12 rounded-xl object-contain"
            priority
          />
          <div className="leading-none">
            <div className="text-[22px] font-black tracking-tight">
              Grants<span className="text-[#69a1ff]">Copilot</span>
            </div>
            <div className="mt-1 text-[10px] font-semibold text-white/58">
              Grants that come to you
            </div>
          </div>
        </Link>

        <div className="mt-8 flex min-h-0 flex-1 flex-col overflow-hidden">
          <Suspense
            fallback={<DashboardNav profileStrength={0} placement="sidebar" />}
          >
            <SidebarNavWithProfileStrength />
          </Suspense>
        </div>
      </aside>

      <div className="min-w-0 lg:pl-[250px]">
        <header className="sticky top-0 z-30 border-b border-[#dfe8f5] bg-white/90 backdrop-blur-xl">
          <div className="mx-auto flex h-20 max-w-[1280px] items-center justify-between gap-2 px-3 sm:px-7 lg:px-8">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <DashboardNav profileStrength={0} placement="header" />
              <Link
                href="/"
                className="flex min-w-0 items-center gap-2 lg:hidden"
                aria-label="GrantsCopilot home"
              >
                <Image
                  src="/logogc.png"
                  alt=""
                  width={42}
                  height={42}
                  className="h-10 w-10 object-contain"
                  priority
                />
                <span className="hidden truncate text-lg font-black min-[390px]:inline">
                  Grants<span className="text-[#2468e8]">Copilot</span>
                </span>
              </Link>
              <div className="hidden lg:block">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#6f7f96]">
                  Autonomous Funding Infrastructure
                </p>
                <p className="mt-1 text-sm font-semibold text-[#243a5a]">
                  What if grants came to you? Find it. Fill it. Fund it.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <button
                type="button"
                className="hidden h-10 w-10 items-center justify-center rounded-full border border-[#dce6f4] bg-white text-[#071a3a] shadow-sm min-[360px]:flex"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
              </button>
              <Suspense
                fallback={
                  <div className="h-11 w-11 animate-pulse rounded-full bg-muted" />
                }
              >
                <UserNavWithAccountName accountNavPromise={accountNavPromise} />
              </Suspense>
            </div>
          </div>
          <Suspense fallback={null}>
            <HeaderProfileCompletion />
          </Suspense>
        </header>

        <main className="mx-auto w-full min-w-0 max-w-[1280px] px-3 py-5 sm:px-7 sm:py-7 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

async function UserNavWithAccountName({
  accountNavPromise,
}: {
  accountNavPromise: Promise<Awaited<
    ReturnType<typeof loadAccountNavData>
  > | null>;
}) {
  const accountNav = await accountNavPromise;
  return (
    <UserNav
      accountName={accountNav?.accountName}
      profiles={accountNav?.profiles ?? []}
      activeProfileId={accountNav?.activeProfileId ?? null}
      profileLimit={accountNav?.profileLimit ?? 1}
    />
  );
}

async function HeaderProfileCompletion() {
  const { org, orgId } = await getActiveOrg();
  const profile = org.profiles?.[0];
  const missing = profileCompletionFields(profile ?? {}).filter(
    (field) => !field.complete,
  );
  if (!missing.length) return null;
  const completion = criteriaProfileCompletionScore(profile ?? {});
  const nextField = missing[0];
  const nextHref = `/profile?step=${nextField.step}&field=${encodeURIComponent(nextField.key)}&completion=incomplete#profile-completion`;
  return (
    <div className="relative border-t border-blue-200 bg-gradient-to-r from-blue-50 to-emerald-50">
      <details className="group mx-auto max-w-[1280px]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-blue-950 transition-colors hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 sm:px-7 lg:px-8 [&::-webkit-details-marker]:hidden">
          <span>
            Find funding that fits your business{" "}
            <span className="font-normal">· Business DNA {completion}% complete</span>
          </span>
          <span
            aria-hidden="true"
            className="transition-transform group-open:rotate-180"
          >
            ⌄
          </span>
        </summary>
        <div className="absolute inset-x-0 top-full max-h-[50vh] overflow-y-auto border-b border-blue-200 bg-white p-4 shadow-lg">
          <div className="mx-auto max-w-[1216px]">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <h2 className="text-lg font-bold text-[#071a3a]">Your next grant could start with your Business DNA</h2>
                <p className="mt-1 text-sm text-slate-600">Tell us more about {profile?.businessName || "your business"} so we can check grant eligibility and send a personalised daily digest when relevant opportunities are available.</p>
                <p className="mt-2 text-xs text-slate-500">Daily alerts depend on profile readiness, eligible matches and your notification preferences. Free discovery access has no time limit.</p>
              </div>
              <Link href={nextHref} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Complete Business DNA →</Link>
            </div>
            <div className="mb-2 flex justify-between text-xs font-semibold text-slate-600"><span>{completion}% complete</span><span>{missing.length} fields to strengthen your profile</span></div>
            <div role="progressbar" aria-label="Business DNA completion" aria-valuenow={completion} aria-valuemin={0} aria-valuemax={100} className="mb-4 h-2 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${completion}%` }} /></div>
            <Suspense fallback={<p className="mt-4 text-xs text-slate-500" role="status">Finding a few opportunities to explore…</p>}>
              <ProfileOpportunityPreview orgId={orgId} profile={profile ?? {}} />
            </Suspense>
            <p className="mb-2 mt-4 text-sm font-semibold">Start with {nextField.label.toLowerCase()}, or choose a field:</p>
            <div className="flex flex-wrap gap-2">
              {missing.map((field) => (
                <a
                  key={field.key}
                  href={`/profile?step=${field.step}&field=${encodeURIComponent(field.key)}&completion=incomplete#profile-completion`}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 transition hover:bg-amber-100 hover:shadow-md active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-600 motion-reduce:transform-none"
                >
                  ○ {field.label} →
                </a>
              ))}
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
