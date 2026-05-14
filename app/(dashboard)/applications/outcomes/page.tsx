import Link from "next/link";
import { getActiveOrg } from "@/lib/auth";
import { fetchApplicationsNeedingOutcome } from "@/lib/outcome-feedback";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardCheck } from "lucide-react";

export default async function ApplicationsOutcomesPage() {
  const { orgId } = await getActiveOrg();
  const pending = await fetchApplicationsNeedingOutcome(orgId);

  return (
    <div className="mx-auto max-w-7xl p-6">
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

      {pending.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-medium">You&apos;re up to date</h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              No submitted applications are waiting on outcome feedback right now. When you submit more grants,
              open each application after you hear back and record the result.
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
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{p.grantName}</p>
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
                  <Link href={`/applications/${p.applicationId}`}>
                    <Button size="sm">Record outcome</Button>
                  </Link>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
