import Link from "next/link";
import { getActiveOrg } from "@/lib/auth";
import { fetchApplicationsNeedingOutcome, fetchRecordedOutcomeInsights, type RecordedOutcomeInsight } from "@/lib/outcome-feedback";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, ClipboardCheck, TrendingUp } from "lucide-react";

export default async function ApplicationsOutcomesPage() {
  const { orgId } = await getActiveOrg();
  const [pending, recorded] = await Promise.all([
    fetchApplicationsNeedingOutcome(orgId),
    fetchRecordedOutcomeInsights(orgId),
  ]);

  return (
    <div className="mx-auto max-w-7xl min-w-0 px-4 py-6 sm:p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Outcome feedback</h1>
        <p className="mt-1 text-muted-foreground">
          Submitted applications where we still need a definitive funder outcome — awards, rejections, shortlists,
          or withdrawals — so your intelligence scores stay accurate.
        </p>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Record the funder response text and optional screenshot evidence on each submitted application. GrantsCopilot uses
          those signals to improve future eligibility scoring, document preparation, and grant recommendations.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/applications" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
            All applications
          </Link>
          <span className="text-sm text-muted-foreground">·</span>
          <Link href="/intelligence" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Intelligence hub
          </Link>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            Outcome queue
          </h2>
          <Badge variant="secondary">{pending.length} waiting</Badge>
        </div>

        {pending.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <ClipboardCheck className="h-10 w-10 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-medium">You&apos;re up to date</h3>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                No submitted applications are waiting on a funder outcome right now.
              </p>
              <Link href="/applications?status=submitted" className="mt-4">
                <Button variant="outline">View submitted applications</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {pending.map((p) => (
              <li key={p.applicationId}>
                <Card className="transition-colors hover:bg-muted/40">
                  <CardContent className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-words font-semibold">{p.grantName}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Status: {p.status.replace(/_/g, " ")}
                        {p.submittedAt && (
                          <>
                            {" "}
                            · Submitted {new Date(p.submittedAt).toLocaleDateString("en-GB")}
                          </>
                        )}
                      </p>
                      {p.outcomeRecorded && (
                        <p className="mt-1 text-xs text-amber-800">
                          Recorded as &quot;{p.outcomeRecorded}&quot; — update when you have a final decision.
                        </p>
                      )}
                    </div>
                    <Link href={`/applications/${p.applicationId}`} className="shrink-0">
                      <Button size="sm">Record outcome</Button>
                    </Link>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <BarChart3 className="h-4 w-4 text-primary" />
            Recorded intelligence
          </h2>
          <Badge variant="outline">{recorded.length} signals</Badge>
        </div>

        {recorded.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <TrendingUp className="h-10 w-10 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-medium">No learning signals yet</h3>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Saved outcomes will appear here with what the AI learned and how it should improve future recommendations.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            {recorded.map((item) => (
              <OutcomeInsightCard key={`${item.applicationId}-${item.reportedAt ?? item.outcome}`} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function OutcomeInsightCard({ item }: { item: RecordedOutcomeInsight }) {
  return (
    <Card className="min-w-0">
      <CardContent className="min-w-0 space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-words font-semibold">{item.grantName}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {item.funder}
              {item.reportedAt && <> · Recorded {new Date(item.reportedAt).toLocaleDateString("en-GB")}</>}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Badge>{item.outcome.replace(/_/g, " ")}</Badge>
            {item.scoringAdjustment != null && (
              <Badge variant={item.scoringAdjustment >= 0 ? "secondary" : "outline"}>
                {item.scoringAdjustment >= 0 ? "+" : ""}{item.scoringAdjustment} scoring signal
              </Badge>
            )}
          </div>
        </div>

        <p className="break-words text-sm leading-6 text-muted-foreground">{item.summary}</p>

        <InsightList title="Strengths to repeat" items={item.strengths} />
        <InsightList title="Gaps to improve" items={item.weaknesses} />
        <InsightList title="Next actions" items={item.nextActions} />

        {(item.funderFeedback || item.responseText || item.userNotes) && (
          <details className="rounded-md border bg-muted/20 p-3 text-sm">
            <summary className="cursor-pointer font-medium">Evidence saved</summary>
            <div className="mt-3 space-y-3 text-muted-foreground">
              {item.funderFeedback && <p className="break-words">{item.funderFeedback}</p>}
              {item.responseText && <p className="break-words">{item.responseText}</p>}
              {item.userNotes && <p className="break-words">{item.userNotes}</p>}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function InsightList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="mt-2 space-y-1 text-sm text-foreground">
        {items.slice(0, 4).map((item) => (
          <li key={item} className="break-words">- {item}</li>
        ))}
      </ul>
    </div>
  );
}
