import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveOrg } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { ApplicationCardWithDelete } from "@/components/dashboard/application-card-with-delete";
import { applicationNeedsOutcomeReminder } from "@/lib/outcome-feedback";

const IN_PROGRESS_STATUSES = ["FILLING", "REVIEW_REQUIRED"] as const;
const SUBMITTED_STATUSES = ["SUBMITTED", "APPROVED"] as const;
const APPLICATION_PAGE_SIZE_OPTIONS = [20, 30, 50] as const;
const DEFAULT_APPLICATION_PAGE_SIZE = 20;

function normalizeStatusFilter(raw: string | undefined): "in_progress" | "submitted" | null {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();
  if (s === "in_progress" || s === "active") return "in_progress";
  if (s === "submitted") return "submitted";
  return null;
}

function normalizeNeedsOutcome(raw: string | undefined): boolean {
  if (!raw) return false;
  const s = raw.toLowerCase().trim();
  return s === "1" || s === "true" || s === "yes";
}

function normalizePage(raw: string | undefined): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function normalizePageSize(raw: string | undefined): number {
  const parsed = Number(raw);
  return (APPLICATION_PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed)
    ? parsed
    : DEFAULT_APPLICATION_PAGE_SIZE;
}

function buildApplicationsPageHref({
  status,
  needsOutcome,
  page,
  pageSize,
}: {
  status: "in_progress" | "submitted" | null;
  needsOutcome: boolean;
  page: number;
  pageSize: number;
}): string {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (needsOutcome) params.set("needs_outcome", "1");
  if (page > 1) params.set("page", String(page));
  if (pageSize !== DEFAULT_APPLICATION_PAGE_SIZE) params.set("pageSize", String(pageSize));
  const query = params.toString();
  return query ? `/applications?${query}` : "/applications";
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; needs_outcome?: string; page?: string; pageSize?: string }>;
}) {
  const params = await searchParams;
  const statusFilter = normalizeStatusFilter(params.status);
  const needsOutcomeOnly = normalizeNeedsOutcome(params.needs_outcome);
  const page = normalizePage(params.page);
  const pageSize = normalizePageSize(params.pageSize);
  const offset = (page - 1) * pageSize;

  const { orgId } = await getActiveOrg();
  const supabase = getSupabaseAdmin();

  let applicationsQuery = supabase
    .from("Application")
    .select("*, Grant(*)", { count: "exact" })
    .eq("organisationId", orgId)
    .order("createdAt", { ascending: false });

  if (statusFilter === "in_progress") {
    applicationsQuery = applicationsQuery.in("status", [...IN_PROGRESS_STATUSES]);
  } else if (statusFilter === "submitted" || needsOutcomeOnly) {
    applicationsQuery = applicationsQuery.in("status", [...SUBMITTED_STATUSES]);
  }

  const { data: rows = [], count: totalFilteredCount = 0 } = await applicationsQuery.range(offset, offset + pageSize - 1);

  const applications = (rows ?? []).map((app: { id: string; status: string; stopped_at?: string; stoppedAt?: string; Grant?: { name: string; funder: string; amount?: number }; createdAt: string }) => {
    const stoppedAt = app.stopped_at ?? app.stoppedAt;
    const displayStatus = app.status === "FAILED" && stoppedAt ? "STOPPED" : app.status;
    return {
      ...app,
      grant: app.Grant ?? { name: "", funder: "", amount: null },
      createdAt: app.createdAt,
      displayStatus,
    };
  });

  const submittedIds = applications
    .filter((a) => (SUBMITTED_STATUSES as readonly string[]).includes(a.status))
    .map((a) => a.id);

  const outcomeByApp = new Map<string, string>();
  if (submittedIds.length > 0) {
    const chunkSize = 20;
    for (let i = 0; i < submittedIds.length; i += chunkSize) {
      const chunk = submittedIds.slice(i, i + chunkSize);
      const { data: oc } = await supabase
        .from("ApplicationOutcome")
        .select("applicationId, outcome")
        .eq("organisationId", orgId)
        .in("applicationId", chunk);
      for (const row of oc ?? []) {
        const r = row as { applicationId?: string; outcome?: string };
        if (r.applicationId && r.outcome) outcomeByApp.set(r.applicationId, r.outcome);
      }
    }
  }

  const filteredForDisplay =
    needsOutcomeOnly
      ? applications.filter(
          (a) =>
            (SUBMITTED_STATUSES as readonly string[]).includes(a.status) &&
            applicationNeedsOutcomeReminder(outcomeByApp.get(a.id))
        )
      : applications;

  const filterDescription =
    needsOutcomeOnly && statusFilter === null
      ? "Showing submitted applications that still need outcome feedback (award, rejection, shortlist, or withdrawal)."
      : needsOutcomeOnly && statusFilter === "submitted"
        ? "Submitted applications still waiting on outcome feedback."
        : statusFilter === "in_progress"
          ? "Showing applications in progress (drafting or awaiting your review)."
          : statusFilter === "submitted"
            ? "Showing submitted or approved applications."
            : null;

  const pendingOutcomeCount = applications.filter(
    (a) =>
      (SUBMITTED_STATUSES as readonly string[]).includes(a.status) &&
      applicationNeedsOutcomeReminder(outcomeByApp.get(a.id))
  ).length;
  const totalPages = Math.max(1, Math.ceil((totalFilteredCount ?? filteredForDisplay.length) / pageSize));
  const safePage = Math.min(page, totalPages);
  const previousHref = buildApplicationsPageHref({ status: statusFilter, needsOutcome: needsOutcomeOnly, page: Math.max(1, safePage - 1), pageSize });
  const nextHref = buildApplicationsPageHref({ status: statusFilter, needsOutcome: needsOutcomeOnly, page: Math.min(totalPages, safePage + 1), pageSize });

  return (
    <div className="mx-auto max-w-7xl min-w-0 px-4 py-6 sm:p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Applications</h1>
        <p className="mt-1 text-muted-foreground">
          {filterDescription ?? "Track the progress of your grant applications."}
        </p>
        {(statusFilter || needsOutcomeOnly) && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/applications"
              className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              Clear filters
            </Link>
            <span className="text-sm text-muted-foreground">·</span>
            <Link href="/applications?status=in_progress" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              In progress only
            </Link>
            <span className="text-sm text-muted-foreground">·</span>
            <Link href="/applications?status=submitted" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Submitted only
            </Link>
            {pendingOutcomeCount > 0 && (
              <>
                <span className="text-sm text-muted-foreground">·</span>
                <Link
                  href="/applications?needs_outcome=1"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  Needs outcome ({pendingOutcomeCount})
                </Link>
              </>
            )}
            <span className="text-sm text-muted-foreground">·</span>
            <Link href="/applications/outcomes" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Outcome queue
            </Link>
          </div>
        )}
        {!statusFilter && !needsOutcomeOnly && pendingOutcomeCount > 0 && (
          <div className="mt-3">
            <Link
              href="/applications?needs_outcome=1"
              className="text-sm font-semibold text-amber-800 underline-offset-4 hover:underline"
            >
              {pendingOutcomeCount} application{pendingOutcomeCount === 1 ? "" : "s"} need outcome feedback — filter list
            </Link>
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>
            {totalFilteredCount ?? filteredForDisplay.length} application{(totalFilteredCount ?? filteredForDisplay.length) === 1 ? "" : "s"}
            {totalPages > 1 ? ` · Page ${safePage} of ${totalPages}` : ""}
          </span>
          <span className="hidden text-muted-foreground sm:inline">·</span>
          <span className="flex items-center gap-2">
            <span>Per page</span>
            {(APPLICATION_PAGE_SIZE_OPTIONS as readonly number[]).map((size) => (
              <Link
                key={size}
                href={buildApplicationsPageHref({ status: statusFilter, needsOutcome: needsOutcomeOnly, page: 1, pageSize: size })}
                className={size === pageSize ? "font-semibold text-primary" : "hover:text-foreground"}
              >
                {size}
              </Link>
            ))}
          </span>
        </div>
      </div>

      {applications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-medium">No applications yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Browse available grants and click Apply to get started.
            </p>
            <Link href="/grants" className="mt-4">
              <Button>Browse Grants</Button>
            </Link>
          </CardContent>
        </Card>
      ) : filteredForDisplay.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14 text-center">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <h3 className="mt-4 font-medium">No applications in this view</h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Try another filter or view all applications.
            </p>
            <Link href="/applications" className="mt-4">
              <Button variant="outline">View all applications</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredForDisplay.map((app) => (
            <ApplicationCardWithDelete
              key={app.id}
              id={app.id}
              grantName={app.grant.name}
              funder={app.grant.funder + (app.grant.amount != null ? ` - ${Number(app.grant.amount).toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 })}` : "")}
              displayStatus={app.displayStatus ?? app.status}
              createdAt={app.createdAt}
              needsOutcomeReminder={
                (SUBMITTED_STATUSES as readonly string[]).includes(app.status) &&
                applicationNeedsOutcomeReminder(outcomeByApp.get(app.id))
              }
              canMarkSubmitted={!(SUBMITTED_STATUSES as readonly string[]).includes(app.status)}
            />
          ))}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <Link
                href={previousHref}
                aria-disabled={safePage <= 1}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  safePage <= 1 ? "pointer-events-none opacity-40" : "hover:bg-muted"
                }`}
              >
                Previous
              </Link>
              <span className="text-sm text-muted-foreground">
                {safePage} / {totalPages}
              </span>
              <Link
                href={nextHref}
                aria-disabled={safePage >= totalPages}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  safePage >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-muted"
                }`}
              >
                Next
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
