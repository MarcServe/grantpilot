import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveOrg } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Search,
  FileText,
  ArrowRight,
  Clock,
  Sparkles,
  Target,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  FILLING: "bg-blue-100 text-blue-800",
  REVIEW_REQUIRED: "bg-purple-100 text-purple-800",
  APPROVED: "bg-green-100 text-green-800",
  SUBMITTED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  STOPPED: "bg-slate-100 text-slate-700",
};

export default async function DashboardPage() {
  const { org, orgId } = await getActiveOrg();
  const supabase = getSupabaseAdmin();

  const profile = org.profiles?.[0];
  const completionScore = profile?.completionScore ?? 0;

  const { data: recentApplications = [] } = await supabase
    .from("Application")
    .select("*, Grant(*)")
    .eq("organisationId", orgId)
    .order("createdAt", { ascending: false })
    .limit(5);

  const { count: totalApplications } = await supabase
    .from("Application")
    .select("id", { count: "exact", head: true })
    .eq("organisationId", orgId);

  const { count: activeApplications } = await supabase
    .from("Application")
    .select("id", { count: "exact", head: true })
    .eq("organisationId", orgId)
    .in("status", ["FILLING", "REVIEW_REQUIRED"]);

  const appsWithGrant = (recentApplications ?? []).map(
    (app: { Grant?: { name: string; funder: string }; createdAt: string; id: string; status: string; stopped_at?: string; stoppedAt?: string }) => {
      const stoppedAt = app.stopped_at ?? app.stoppedAt;
      const displayStatus = app.status === "FAILED" && stoppedAt ? "STOPPED" : app.status;
      return {
        ...app,
        grant: app.Grant ?? { name: "", funder: "" },
        createdAt: app.createdAt,
        displayStatus,
      };
    }
  );

  let suggestedGrants: { grantId: string; grantName: string; score: number }[] = [];
  let withinReachGrants: { grantId: string; grantName: string; score: number; summary?: string }[] = [];
  if (profile && completionScore >= 50) {
    const { data: assessments = [] } = await supabase
      .from("EligibilityAssessment")
      .select("grant_id, score, summary")
      .eq("organisation_id", orgId)
      .eq("profile_id", profile.id)
      .order("score", { ascending: false });
    const grantIds = (assessments as { grant_id: string; score: number; summary: string | null }[]).map((a) => a.grant_id);
    if (grantIds.length > 0) {
      const { data: grantsList = [] } = await supabase
        .from("Grant")
        .select("id, name")
        .in("id", grantIds);
      const nameById = new Map((grantsList as { id: string; name: string }[]).map((g) => [g.id, g.name]));
      for (const a of assessments as { grant_id: string; score: number; summary: string | null }[]) {
        const name = nameById.get(a.grant_id) ?? "Grant";
        if (a.score >= 80) suggestedGrants.push({ grantId: a.grant_id, grantName: name, score: a.score });
        else if (a.score >= 50) withinReachGrants.push({ grantId: a.grant_id, grantName: name, score: a.score, summary: a.summary ?? undefined });
      }
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Welcome back. Here&apos;s an overview of your grant activity.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Profile Completion
            </CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completionScore}%</div>
            <Progress value={completionScore} className="mt-3 h-2" />
            {completionScore < 100 && (
              <Link href="/profile">
                <Button variant="link" className="mt-2 h-auto p-0 text-xs">
                  Complete your profile <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Total Applications
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalApplications ?? 0}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeApplications ?? 0} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Available Grants
            </CardTitle>
            <Search className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Link href="/grants">
              <Button variant="default" size="sm" className="gap-2">
                Browse Grants <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <p className="mt-2 text-xs text-muted-foreground">
              {completionScore >= 50
                ? "Get AI-powered grant matches"
                : "Complete your profile first"}
            </p>
          </CardContent>
        </Card>
      </div>

      {(suggestedGrants.length > 0 || withinReachGrants.length > 0) && (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {suggestedGrants.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Suggested for you
                </CardTitle>
                <p className="text-sm font-normal text-muted-foreground">
                  High eligibility based on your profile. We&apos;ve notified you about these.
                </p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {suggestedGrants.slice(0, 5).map((g) => (
                    <li key={g.grantId}>
                      <Link
                        href={`/grants/${g.grantId}`}
                        className="flex items-center justify-between rounded-md p-2 hover:bg-muted"
                      >
                        <span className="font-medium">{g.grantName}</span>
                        <Badge variant="default">{g.score}%</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href="/grants" className="mt-3 inline-block text-sm text-primary hover:underline">
                  View all grants <ArrowRight className="inline h-3 w-3" />
                </Link>
              </CardContent>
            </Card>
          )}
          {withinReachGrants.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="h-4 w-4 text-amber-600" />
                  Within reach
                </CardTitle>
                <p className="text-sm font-normal text-muted-foreground">
                  Partial fit. Open a grant to see how to improve your eligibility.
                </p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {withinReachGrants.slice(0, 5).map((g) => (
                    <li key={g.grantId}>
                      <Link
                        href={`/grants/${g.grantId}`}
                        className="flex items-center justify-between rounded-md p-2 hover:bg-muted"
                      >
                        <span className="font-medium">{g.grantName}</span>
                        <Badge variant="secondary">{g.score}%</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href="/grants" className="mt-3 inline-block text-sm text-primary hover:underline">
                  View all grants <ArrowRight className="inline h-3 w-3" />
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Applications</h2>
          {(totalApplications ?? 0) > 0 && (
            <Link href="/applications">
              <Button variant="ghost" size="sm">
                View All
              </Button>
            </Link>
          )}
        </div>

        {appsWithGrant.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground" />
              <h3 className="mt-4 font-medium">No applications yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Browse grants and click Apply to get started.
              </p>
              <Link href="/grants" className="mt-4">
                <Button size="sm">Browse Grants</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {appsWithGrant.map((app) => (
              <Link key={app.id} href={`/applications/${app.id}`}>
                <Card className="transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="font-medium">{app.grant.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {app.grant.funder}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        variant="secondary"
                        className={STATUS_COLORS[app.displayStatus] ?? ""}
                      >
                        {app.displayStatus.replace(/_/g, " ")}
                      </Badge>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(app.createdAt).toLocaleDateString("en-GB")}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
