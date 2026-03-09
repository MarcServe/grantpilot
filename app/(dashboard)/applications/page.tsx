import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveOrg } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { ApplicationCardWithDelete } from "@/components/dashboard/application-card-with-delete";

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
            <ApplicationCardWithDelete
              key={app.id}
              id={app.id}
              grantName={app.grant.name}
              funder={app.grant.funder + (app.grant.amount != null ? ` — ${Number(app.grant.amount).toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 })}` : "")}
              displayStatus={app.displayStatus ?? app.status}
              createdAt={app.createdAt}
            />
          ))}
        </div>
      )}
    </div>
  );
}
