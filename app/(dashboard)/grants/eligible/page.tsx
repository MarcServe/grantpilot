import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, ArrowRight, Building2 } from "lucide-react";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BatchedEligibleGrantsList } from "@/components/grants/batched-eligible-grants-list";
import { BusinessDnaMatchHealth } from "@/components/profile/business-dna-match-health";
import { getMatchHealthReport } from "@/lib/match-health";
import { optionalEligibleMatchSection, type EligibleMatchSection } from "@/lib/eligible-match-rules";

const MATCH_PAGE_SIZE_OPTIONS = [20, 30, 50] as const;
const DEFAULT_MATCH_PAGE_SIZE = 20;
const MATCH_HEALTH_ASSESSMENT_LIMIT = 300;

type MatchSearchParams = Promise<{ page?: string; pageSize?: string; tier?: string }>;

function normalizePage(raw: string | undefined): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function normalizePageSize(raw: string | undefined): number {
  const parsed = Number(raw);
  return (MATCH_PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed) ? parsed : DEFAULT_MATCH_PAGE_SIZE;
}

function buildMatchesHref(pageSize: number, tier: EligibleMatchSection | null): string {
  const params = new URLSearchParams();
  if (tier) params.set("tier", tier);
  if (pageSize !== DEFAULT_MATCH_PAGE_SIZE) params.set("pageSize", String(pageSize));
  const query = params.toString();
  return query ? `/grants/eligible?${query}` : "/grants/eligible";
}

export default async function EligibleGrantsPage({
  searchParams,
}: {
  searchParams: MatchSearchParams;
}) {
  const params = await searchParams;
  const initialPage = normalizePage(params.page);
  const pageSize = normalizePageSize(params.pageSize);
  const activeTier = optionalEligibleMatchSection(params.tier);
  const { org, orgId } = await getActiveOrg();
  const supabase = getSupabaseAdmin();

  const profile = org.profiles?.[0];
  const completionScore = (profile as { completionScore?: number; completion_score?: number } | undefined)?.completionScore
    ?? (profile as { completion_score?: number } | undefined)?.completion_score
    ?? 0;
  const profileId = (profile as { id?: string } | undefined)?.id;

  if (!profile || !profileId) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:p-6">
        <Link
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">Create your business profile</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              We need your profile to match you with eligible grants.
            </p>
            <Link href="/profile" className="mt-4">
              <Button size="sm">Go to Profile <ArrowRight className="ml-1 h-3 w-3" /></Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const matchHealthPromise = getMatchHealthReport({
    supabase,
    orgId,
    profile: profile as Record<string, unknown> & { id: string },
    assessmentLimit: MATCH_HEALTH_ASSESSMENT_LIMIT,
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:p-6">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Dashboard
      </Link>

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Matches</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Suggested 85%+ matches load first. Fresh sub-85% grants appear at the top of Within reach, followed by
            older near-matches and other scored grants in smaller batches.
          </p>
        </div>
        <Link
          href="/grants?shelf=expired"
          className="shrink-0 rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Expired archive
        </Link>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground sm:basis-full">
          <span>Per batch</span>
          {(MATCH_PAGE_SIZE_OPTIONS as readonly number[]).map((size) => (
            <Link
              key={size}
              href={buildMatchesHref(size, activeTier)}
              className={size === pageSize ? "font-semibold text-primary" : "hover:text-foreground"}
            >
              {size}
            </Link>
          ))}
        </div>
      </div>

      {completionScore < 50 && (
        <Card className="mb-6 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40">
          <CardContent className="flex items-center gap-3 py-4">
            <Building2 className="h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Profile completion: {completionScore}%
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Complete at least 50% of your profile to unlock full AI-powered matching.{" "}
                <Link href="/profile" className="font-medium underline">Complete profile</Link>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <BatchedEligibleGrantsList
        initialTier={activeTier}
        initialPage={initialPage}
        pageSize={pageSize}
      />

      <Suspense fallback={<BusinessDnaMatchHealthSkeleton />}>
        <BusinessDnaMatchHealthPanel
          matchHealthPromise={matchHealthPromise}
          profile={profile as Record<string, unknown>}
        />
      </Suspense>
    </div>
  );
}

async function BusinessDnaMatchHealthPanel({
  matchHealthPromise,
  profile,
}: {
  matchHealthPromise: Promise<Awaited<ReturnType<typeof getMatchHealthReport>>>;
  profile: Record<string, unknown>;
}) {
  const matchHealth = await matchHealthPromise;
  return <BusinessDnaMatchHealth report={matchHealth} profile={profile} />;
}

function BusinessDnaMatchHealthSkeleton() {
  return (
    <div className="mb-6 rounded-xl border border-amber-100 bg-amber-50/50 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-5 w-56 animate-pulse rounded bg-amber-100" />
          <div className="h-4 w-full max-w-2xl animate-pulse rounded bg-amber-100" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-amber-100" />
        </div>
        <div className="h-10 w-44 animate-pulse rounded bg-amber-100" />
      </div>
    </div>
  );
}
