import { notFound } from "next/navigation";
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveOrg } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
import { SubmitSection } from "@/components/applications/submit-section";

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
  APPROVED: "bg-green-100 text-green-800",
  SUBMITTED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
};

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId } = await getActiveOrg();
  const supabase = getSupabaseAdmin();

  const { data: applicationRow } = await supabase
    .from("Application")
    .select("*, Grant(*), BusinessProfile(*)")
    .eq("id", id)
    .eq("organisationId", orgId)
    .maybeSingle();

  const application = applicationRow
    ? {
        ...applicationRow,
        grant: Array.isArray(applicationRow.Grant) ? applicationRow.Grant[0] : applicationRow.Grant,
        profile: Array.isArray(applicationRow.BusinessProfile) ? applicationRow.BusinessProfile[0] : applicationRow.BusinessProfile,
      }
    : null;

  if (!application) notFound();
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

  const totalItems = session?.total_items ?? 0;
  const processedItems = session?.processed_items ?? 0;
  const progressPercent = totalItems > 0 ? (processedItems / totalItems) * 100 : 0;
  const sessionStatus = (session?.status as string) ?? "unknown";
  const isComplete = sessionStatus === "completed";
  const canSubmit =
    isComplete &&
    (application.status === "FILLING" || application.status === "REVIEW_REQUIRED");

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link
        href="/applications"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Applications
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{application.grant.name}</h1>
          <p className="text-muted-foreground">{application.grant.funder}</p>
        </div>
        <Badge
          variant="secondary"
          className={STATUS_COLORS[application.status] ?? ""}
        >
          {application.status.replace(/_/g, " ")}
        </Badge>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Execution Progress
          </CardTitle>
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
          <CardTitle className="text-sm font-medium">Steps</CardTitle>
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
                }) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      {ITEM_STATUS_ICON[item.status] ?? (
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium">
                        {(item.action ?? "Unknown step")
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (l: string) => l.toUpperCase())}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {item.status}
                    </Badge>
                  </div>
                )
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No execution steps found.
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

      {canSubmit && (
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
