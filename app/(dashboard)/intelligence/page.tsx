import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveOrg } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EligibilityNotificationPreferences } from "@/components/profile/eligibility-notification-preferences";
import {
  Brain,
  FileSearch,
  Send,
  Scale,
  Network,
  ArrowRight,
} from "lucide-react";

export default async function IntelligencePage() {
  const { orgId } = await getActiveOrg();
  const supabase = getSupabaseAdmin();

  let appWithSnapshot: { filled_snapshot?: unknown } | null = null;
  const { data: byOrgId } = await supabase
    .from("Application")
    .select("id, filled_snapshot, status")
    .eq("organisationId", orgId)
    .not("filled_snapshot", "is", null)
    .order("createdAt", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (byOrgId) appWithSnapshot = byOrgId;
  if (!appWithSnapshot) {
    const { data: byOrgIdAlt } = await supabase
      .from("Application")
      .select("id, filled_snapshot, status")
      .eq("organisation_id", orgId)
      .not("filled_snapshot", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byOrgIdAlt) appWithSnapshot = byOrgIdAlt;
  }
  const snapshot = (appWithSnapshot as { filled_snapshot?: { fields?: unknown[]; fileNames?: string[] } } | null)
    ?.filled_snapshot;
  const fieldCount = snapshot?.fields?.length ?? 0;
  const fileCount = snapshot?.fileNames?.length ?? 0;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Grants-Copilot Intelligence</h1>
        <p className="mt-1 text-muted-foreground">
          Vertical depth that general assistants can&apos;t replicate: structured form intelligence,
          portal automation, eligibility decisions, and grant knowledge.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSearch className="h-5 w-5" />
              Structured form intelligence
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              We parse grant forms and map your profile to fields automatically — no manual copy-paste.
              Required attachments (videos, documents) are detected and matched to your uploads.
            </p>
            {fieldCount > 0 && (
              <p className="text-xs text-muted-foreground">
                Last run: {fieldCount} fields and {fileCount} file(s) captured for review.
              </p>
            )}
            <Link href="/applications">
              <Button variant="outline" size="sm" className="gap-1">
                View applications <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Send className="h-5 w-5" />
              Portal submission automation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              One flow: we open the funder&apos;s portal, fill company and financial data, upload
              documents, then pause for your review before final submit. No switching tabs.
            </p>
            <Link href="/grants">
              <Button variant="outline" size="sm" className="gap-1">
                Start an application <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Scale className="h-5 w-5" />
              Eligibility decision engine
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Per-grant eligibility score (e.g. 90% eligible), reasons why, and for partial fits a GrantsCopilot improvement plan. Scores are cached and shown on the grants list; we notify you for high-fit grants.
            </p>
            <Link href="/grants">
              <Button variant="outline" size="sm" className="gap-1">
                Open a grant and check eligibility <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <EligibilityNotificationPreferences />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Network className="h-5 w-5" />
              Grant knowledge
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Grants by funder, similar grants by sector and amount, and GrantsCopilot matching so you see
              the best-fit opportunities first. More structure coming: funder graph, requirements graph.
            </p>
            <Link href="/grants">
              <Button variant="outline" size="sm" className="gap-1">
                Browse & match grants <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8 border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center sm:flex-row sm:justify-center sm:text-left">
          <Brain className="h-10 w-10 text-primary" />
          <div>
            <p className="font-medium">
              What this page shows you
            </p>
            <p className="text-sm text-muted-foreground">
              Here you see how Grants-Copilot works under the hood: form parsing and field mapping,
              per-grant eligibility scores and improvement tips, and GrantsCopilot matching so you
              can focus on the best-fit grants first.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
