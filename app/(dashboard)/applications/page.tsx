import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveOrg } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Clock, ArrowRight } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  FILLING: "bg-blue-100 text-blue-800",
  REVIEW_REQUIRED: "bg-purple-100 text-purple-800",
  APPROVED: "bg-green-100 text-green-800",
  SUBMITTED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  STOPPED: "bg-slate-100 text-slate-700",
};

export default async function ApplicationsPage() {
  const { orgId } = await getActiveOrg();
  const supabase = getSupabaseAdmin();

  const { data: rows = [] } = await supabase
    .from("Application")
    .select("*, Grant(*)")
    .eq("organisationId", orgId)
    .order("createdAt", { ascending: false });

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

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Applications</h1>
        <p className="mt-1 text-muted-foreground">
          Track the progress of your grant applications.
        </p>
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
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <Link key={app.id} href={`/applications/${app.id}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{app.grant.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {app.grant.funder}
                      {app.grant.amount != null &&
                        ` — ${Number(app.grant.amount).toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 })}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="secondary"
                      className={STATUS_COLORS[app.displayStatus ?? app.status] ?? ""}
                    >
                      {(app.displayStatus ?? app.status).replace(/_/g, " ")}
                    </Badge>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(app.createdAt).toLocaleDateString("en-GB")}
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
