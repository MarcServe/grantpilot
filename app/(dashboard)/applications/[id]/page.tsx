import { notFound } from "next/navigation";
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveOrg } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, CheckCircle, XCircle, Clock, Loader2, AlertCircle } from "lucide-react";
import { SubmitSection } from "@/components/applications/submit-section";
import { StopApplicationButton } from "@/components/applications/stop-application-button";
import { ApplicationTaskList } from "@/components/applications/application-task-list";
import { EditableSnapshot } from "@/components/applications/editable-snapshot";
import { NeedsInputForm } from "@/components/applications/needs-input-form";
import { ApplicationSessionPoller } from "@/components/applications/application-session-poller";
import { OutcomeLearningForm } from "@/components/applications/outcome-learning-form";

const ITEM_STATUS_ICON: Record<string, React.ReactNode> = {
  done: <CheckCircle className="h-4 w-4 text-green-600" />,
  failed: <XCircle className="h-4 w-4 text-red-600" />,
  processing: <Loader2 className="h-4 w-4 animate-spin text-blue-600" />,
  pending: <Clock className="h-4 w-4 text-muted-foreground" />,
  skipped: <XCircle className="h-4 w-4 text-yellow-600" />,
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  FILLING: "bg-blue-100 text-blue-800",
  REVIEW_REQUIRED: "bg-purple-100 text-purple-800",
  NEEDS_INPUT: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-800",
  SUBMITTED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  STOPPED: "bg-slate-100 text-slate-700",
};

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId } = await getActiveOrg();
  const supabase = getSupabaseAdmin();

  let { data: applicationRow } = await supabase
    .from("Application")
    .select("*, Grant(*), BusinessProfile(*)")
    .eq("id", id)
    .eq("organisationId", orgId)
    .maybeSingle();

  if (!applicationRow) {
    const alt = await supabase
      .from("Application")
      .select("*, Grant(*), BusinessProfile(*)")
      .eq("id", id)
      .eq("organisation_id", orgId)
      .maybeSingle();
    applicationRow = alt.data ?? null;
  }

  const application = applicationRow
    ? {
        ...applicationRow,
        grant: Array.isArray(applicationRow.Grant) ? applicationRow.Grant[0] : applicationRow.Grant,
        profile: Array.isArray(applicationRow.BusinessProfile) ? applicationRow.BusinessProfile[0] : applicationRow.BusinessProfile,
      }
    : null;

  if (!application) notFound();
  const stoppedAt = (application as { stopped_at?: string; stoppedAt?: string }).stopped_at ?? (application as { stoppedAt?: string }).stoppedAt;
  const displayStatus = application.status === "FAILED" && stoppedAt ? "STOPPED" : application.status;
  const publicId = `grantapp_${application.id}`;

  const { data: session } = await supabase
    .from("cu_sessions")
    .select("*")
    .eq("public_id", publicId)
    .single();

  const { data: items } = await supabase
    .from("cu_session_items")
    .select("*")
    .eq("session_id", session?.id ?? -1)
    .order("id", { ascending: true });

  const { data: logs } = await supabase
    .from("cu_session_logs")
    .select("*")
    .eq("session_id", session?.id ?? -1)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: taskRows = [] } = await supabase
    .from("ApplicationTask")
    .select("id, name, status, priority, dueDate, slug")
    .eq("applicationId", application.id)
    .order("dueDate", { ascending: true, nullsFirst: false });
  const tasks = (taskRows ?? []).map((t: { id: string; name: string; status: string; priority: string; dueDate: string | null; slug?: string | null }) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate,
    slug: t.slug ?? null,
  }));

  const { data: outcomeRow } = await supabase
    .from("ApplicationOutcome")
    .select("outcome, awardedAmount, funderFeedback, responseText, responseScreenshotName, responseScreenshotDataUrl, learningNotes")
    .eq("applicationId", application.id)
    .maybeSingle();

  const itemRows = (items ?? []) as { status?: string | null }[];
  const terminalItemCount = itemRows.filter(
    (item) => item.status != null && !["pending", "processing"].includes(item.status)
  ).length;
  const totalItems = session?.total_items ?? itemRows.length;
  const processedItems = Math.max(session?.processed_items ?? 0, terminalItemCount);
  const progressPercent = totalItems > 0 ? (processedItems / totalItems) * 100 : 0;
  const sessionStatus = (session?.status as string) ?? "unknown";
  const isComplete = sessionStatus === "completed";
  const showAutomationProgress =
    session != null &&
    ["PENDING", "FILLING", "NEEDS_INPUT"].includes(String(displayStatus)) &&
    sessionStatus !== "unknown";
  const canMarkSubmitted =
    ["REVIEW_REQUIRED", "APPROVED"].includes(application.status) ||
    (isComplete && application.status === "FILLING");

  const filledSnapshot = (application as {
    filled_snapshot?: {
      fields?: { label: string; name: string; value: string }[];
      fileNames?: string[];
      capturedAt?: string;
      automationRisks?: string[];
      humanReviewRequired?: boolean;
    };
  }).filled_snapshot;
  const showFilledSummary =
    filledSnapshot &&
    (application.status === "FILLING" || application.status === "REVIEW_REQUIRED" || application.status === "APPROVED");

  const sessionItems = (items ?? []) as {
    id: number;
    action: string | null;
    status: string;
    error_message: string | null;
    extra_data?: {
      page_situation?: string;
      needs_direct_url?: boolean;
      notes?: string;
      navigation_events?: {
        step: string;
        detail: string;
        success: boolean;
        metadata?: Record<string, unknown>;
      }[];
      missing_required?: unknown;
    };
  }[];
  const needsInputFromSession = sessionItems
    .flatMap((item) => {
      const missing = item.extra_data?.missing_required;
      return Array.isArray(missing) ? missing : [];
    })
    .filter((field): field is { selector: string; label: string; hint?: string } =>
      field != null &&
      typeof field === "object" &&
      typeof (field as { selector?: unknown }).selector === "string" &&
      typeof (field as { label?: unknown }).label === "string"
    );
  const navigationReachedForm = sessionItems.some(
    (item) =>
      (item.action === "navigate_to_form" || item.action === "enter_application_flow") &&
      item.status === "done" &&
      item.extra_data?.page_situation === "application_form"
  );
  const pageSituationItem = sessionItems.find(
    (i) =>
      !navigationReachedForm &&
      i.extra_data &&
      typeof (i.extra_data as { page_situation?: string }).page_situation === "string"
  );
  const pageSituation = pageSituationItem
    ? (pageSituationItem.extra_data as { page_situation?: string }).page_situation
    : null;
  const grantId = (application.grant as { id?: string } | null)?.id ?? "";
  const pollSession =
    ["PENDING", "FILLING", "REVIEW_REQUIRED", "NEEDS_INPUT"].includes(String(displayStatus)) &&
    sessionStatus !== "completed" &&
    sessionStatus !== "failed" &&
    (totalItems > 0 ? processedItems < totalItems : true);

  return (
    <div className="mx-auto max-w-4xl p-6">
      {pollSession && <ApplicationSessionPoller />}
      <Link
        href="/applications"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Applications
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          {grantId ? (
            <Link
              href={`/grants/${grantId}`}
              className="group inline-block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <h1 className="text-2xl font-bold transition-colors group-hover:text-primary group-hover:underline decoration-primary/40 underline-offset-4">
                {application.grant.name}
              </h1>
            </Link>
          ) : (
            <h1 className="text-2xl font-bold">{application.grant.name}</h1>
          )}
          <p className="text-muted-foreground">{application.grant.funder}</p>
        </div>
        <div className="flex items-center gap-2">
          {["PENDING", "FILLING", "REVIEW_REQUIRED", "NEEDS_INPUT"].includes(displayStatus) && (
            <StopApplicationButton applicationId={application.id} />
          )}
          <Badge
            variant="secondary"
            className={STATUS_COLORS[displayStatus] ?? ""}
          >
            {displayStatus.replace(/_/g, " ")}
          </Badge>
        </div>
      </div>

      {(application.status === "NEEDS_INPUT" || needsInputFromSession.length > 0) && (() => {
        const needsInput = (application as { needs_input?: { selector: string; label: string; hint?: string }[] }).needs_input;
        const list = Array.isArray(needsInput) && needsInput.length > 0 ? needsInput : needsInputFromSession;
        if (list.length === 0) return null;
        return <NeedsInputForm applicationId={application.id} needsInput={list} />;
      })()}

      {pageSituation && (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardContent className="flex gap-3 p-4">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-sm">
              {pageSituation === "login_required" && (
                <>
                  <p className="font-medium text-amber-900">Sign in required</p>
                  <p className="mt-1 text-amber-800">
                    This funder requires you to sign in. Sign in on their site, then use the bookmarklet below or resume the application to continue.
                  </p>
                </>
              )}
              {pageSituation === "competition_list" && (
                <>
                  <p className="font-medium text-amber-900">Use the direct application link</p>
                  <p className="mt-1 text-amber-800">
                    This link goes to a list of schemes. Open the specific grant you want to apply for, copy its URL, and update the application URL for this grant, then retry.
                  </p>
                  <Link
                    href={`/grants/${(application as { grant?: { id?: string } }).grant?.id ?? ""}`}
                    className="mt-2 inline-block text-sm font-medium text-amber-800 underline hover:no-underline"
                  >
                    Edit application URL on grant page
                  </Link>
                </>
              )}
              {pageSituation === "needs_verification" && (
                <>
                  <p className="font-medium text-amber-900">Account or email verification needed</p>
                  <p className="mt-1 text-amber-800">
                    This funder requires you to create an account or verify your email. Complete that on the funder&apos;s site, then use the bookmarklet below or resume the application to continue.
                  </p>
                </>
              )}
              {pageSituation === "page_not_found" && (
                <>
                  <p className="font-medium text-amber-900">Application link may be broken (404)</p>
                  <p className="mt-1 text-amber-800">
                    The application URL for this grant returns a &quot;page not found&quot; error. Please find the correct application page and update the URL, then retry.
                  </p>
                  <Link
                    href={`/grants/${(application as { grant?: { id?: string } }).grant?.id ?? ""}`}
                    className="mt-2 inline-block text-sm font-medium text-amber-800 underline hover:no-underline"
                  >
                    Edit application URL on grant page
                  </Link>
                </>
              )}
              {pageSituation && !["login_required", "competition_list", "needs_verification", "page_not_found"].includes(pageSituation) && (
                <p className="text-amber-800">{pageSituationItem?.extra_data?.notes ?? "This step needs your attention."}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {tasks.length > 0 && (
        <ApplicationTaskList
          applicationId={application.id}
          grantId={grantId || undefined}
          tasks={tasks}
        />
      )}

      {["REVIEW_REQUIRED", "APPROVED", "SUBMITTED", "FAILED"].includes(application.status) && (
        <OutcomeLearningForm
          applicationId={application.id}
          existingOutcome={(outcomeRow as {
            outcome?: "applied" | "shortlisted" | "awarded" | "rejected" | "withdrawn" | "unknown";
            awardedAmount?: number | null;
            funderFeedback?: string | null;
            responseText?: string | null;
            responseScreenshotName?: string | null;
            responseScreenshotDataUrl?: string | null;
            learningNotes?: string | null;
          } | null) ?? null}
        />
      )}

      {!showAutomationProgress && (
        <Card className="mb-6 border-blue-100 bg-blue-50/60">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Preparation workflow</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-blue-950">
            <p>
              This application is tracked for Version 1: review eligibility, generate preparation documents, submit on
              the official funder site, then mark it submitted here.
            </p>
            <div className="flex flex-wrap gap-2">
              {grantId && (
                <Link href={`/founder-pack?grantId=${encodeURIComponent(grantId)}`}>
                  <Button size="sm">Generate prep documents</Button>
                </Link>
              )}
              {(application.grant as { applicationUrl?: string | null })?.applicationUrl && (
                <a
                  href={(application.grant as { applicationUrl?: string }).applicationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="sm" variant="outline">Open funder form</Button>
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {showAutomationProgress && (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Version 2 form session
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Internal form-session diagnostics for applications started before the Version 1 preparation flow.
              </p>
            </CardHeader>
            <CardContent>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span>
                  {processedItems} of {totalItems} steps completed
                </span>
                <span className="text-muted-foreground">
                  {Math.round(progressPercent)}%
                </span>
              </div>
              <Progress value={progressPercent} className="h-2" />
              <p className="mt-2 text-xs text-muted-foreground">
                Session: {sessionStatus}
              </p>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Session steps</CardTitle>
            </CardHeader>
            <CardContent>
              {items && items.length > 0 ? (
                <div className="space-y-3">
                  {items.map(
                (item: {
                  id: number;
                  action: string | null;
                  status: string;
                  error_message: string | null;
                  extra_data?: {
                    notes?: string;
                    navigation_events?: {
                      step: string;
                      detail: string;
                      success: boolean;
                    }[];
                  };
                }) => {
                  const navigationEvents = item.extra_data?.navigation_events ?? [];
                  const itemNeedsInput = Array.isArray((item.extra_data as { missing_required?: unknown })?.missing_required);
                  const recoveredNavigationProbe =
                    navigationReachedForm &&
                    item.action === "open_grant_url" &&
                    item.status === "failed";
                  const statusLabel = itemNeedsInput && item.status === "pending"
                    ? "Needs input"
                    : recoveredNavigationProbe
                      ? "Recovered"
                    : item.status === "skipped"
                      ? "Skipped"
                      : item.status;
                  const statusIcon = recoveredNavigationProbe
                    ? <CheckCircle className="h-4 w-4 shrink-0 text-green-600" />
                    : ITEM_STATUS_ICON[item.status] ?? (
                        <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                      );
                  const notes = recoveredNavigationProbe
                    ? "The first page check was too strict, but the navigation step later reached the form."
                    : item.extra_data?.notes;
                  return (
                    <div key={item.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          {statusIcon}
                          <div className="min-w-0">
                            <span className="text-sm font-medium">
                              {(item.action ?? "Unknown step")
                                .replace(/_/g, " ")
                                .replace(/\b\w/g, (l: string) => l.toUpperCase())}
                            </span>
                            {notes && (
                              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                {notes}
                              </p>
                            )}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={`shrink-0 text-xs ${
                            item.status === "skipped"
                              ? "border-amber-200 bg-amber-50 text-amber-800"
                              : recoveredNavigationProbe
                                ? "border-green-200 bg-green-50 text-green-800"
                                : ""
                          }`}
                        >
                          {statusLabel}
                        </Badge>
                      </div>

                      {navigationEvents.length > 0 && (
                        <div className="mt-3 border-t pt-3">
                          <p className="mb-2 text-xs font-medium text-muted-foreground">
                            Navigation brain
                          </p>
                          <div className="space-y-1.5">
                            {navigationEvents.map((event, index) => (
                              <div key={`${event.step}-${index}`} className="flex items-start gap-2 text-xs">
                                {event.success ? (
                                  <CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-green-600" />
                                ) : (
                                  <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-600" />
                                )}
                                <div className="min-w-0">
                                  <span className="font-medium">
                                    {event.step.replace(/_/g, " ")}
                                  </span>
                                  <p className="text-muted-foreground">{event.detail}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No session steps found.
                </p>
              )}
            </CardContent>
          </Card>

          {logs && logs.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Activity Log
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {logs.map(
                    (log: {
                      id: number;
                      step: string;
                      action: string;
                      detail: string | null;
                      success: boolean;
                      created_at: string;
                    }) => (
                      <div
                        key={log.id}
                        className="flex items-start gap-2 text-xs"
                      >
                        {log.success ? (
                          <CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-green-600" />
                        ) : (
                          <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-600" />
                        )}
                        <div>
                          <span className="font-medium">
                            {log.step}: {log.action}
                          </span>
                          {log.detail && (
                            <p className="text-muted-foreground">{log.detail}</p>
                          )}
                          <p className="text-muted-foreground">
                            {new Date(log.created_at).toLocaleString("en-GB")}
                          </p>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {showFilledSummary && filledSnapshot && (
        <div className="mb-6">
          <EditableSnapshot
            applicationId={application.id}
            fields={filledSnapshot.fields ?? []}
            fileNames={filledSnapshot.fileNames ?? []}
            capturedAt={filledSnapshot.capturedAt}
            screenshotBase64={(filledSnapshot as { screenshotBase64?: string }).screenshotBase64}
            grantUrl={(application.grant as { applicationUrl?: string })?.applicationUrl}
            automationRisks={filledSnapshot.automationRisks ?? []}
            humanReviewRequired={filledSnapshot.humanReviewRequired}
            editable={["FILLING", "REVIEW_REQUIRED"].includes(application.status)}
          />
        </div>
      )}

      {canMarkSubmitted && (
        <>
          <Separator className="my-6" />
          <SubmitSection applicationId={application.id} />
        </>
      )}

      {application.status === "SUBMITTED" && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-medium text-green-800">
                Application Submitted
              </p>
              <p className="text-sm text-green-600">
                Submitted on{" "}
                {application.submittedAt ? new Date(application.submittedAt).toLocaleDateString("en-GB") : ""}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
