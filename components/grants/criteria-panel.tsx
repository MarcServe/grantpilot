"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  CriteriaAssessment,
  CriteriaDocument,
  CriterionStatus,
} from "@/lib/criteria";
import { Button } from "@/components/ui/button";
const labels: Record<CriterionStatus, string> = {
  met: "Met",
  needs_information: "Needs information",
  not_met: "Not met",
  not_applicable: "Not applicable",
};
const colours: Record<CriterionStatus, string> = {
  met: "text-green-800 bg-green-50",
  needs_information: "text-amber-900 bg-amber-50",
  not_met: "text-red-800 bg-red-50",
  not_applicable: "text-slate-700 bg-slate-50",
};
export function CriteriaBadges({
  assessment,
  grantId,
}: {
  assessment: CriteriaAssessment;
  grantId: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Eligibility criteria">
      {(["met", "needs_information", "not_met"] as const).map((status) => (
        <Link
          key={status}
          className={`rounded-md px-2 py-1 text-sm font-semibold ${colours[status]}`}
          href={`/grants/${grantId}?criteria=${status}#verify`}
        >
          {assessment.counts[status]} {labels[status].toLowerCase()}
        </Link>
      ))}
      {assessment.coverage !== "complete" && (
        <span className="text-sm">Source review incomplete</span>
      )}
    </div>
  );
}
type Refresh = {
  status: string;
  error?: string;
  result?: {
    rechecked?: number;
    total?: number;
    becameStrong?: number;
    leftStrong?: number;
    removed?: number;
  };
};
export function CriteriaPanel({
  grantId,
  initialFilter = "all",
}: {
  grantId: string;
  initialFilter?: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<{
    assessment: CriteriaAssessment;
    document: CriteriaDocument | null;
    actionable: boolean;
  } | null>(null);
  const [filter, setFilter] = useState(initialFilter);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastRefreshId, setLastRefreshId] = useState<string | null>(null);
  const [refreshId, setRefreshId] = useState<string | null>(null);
  const [refresh, setRefresh] = useState<Refresh | null>(null);
  const load = useCallback(async () => {
    const r = await fetch(`/api/grants/${grantId}/verify`);
    const b = await r.json();
    if (!r.ok) throw new Error(b.error);
    setData(b);
    if (b.latestRefresh) {
      setLastRefreshId(b.latestRefresh.id);
      setRefresh(b.latestRefresh);
      if (["queued", "running"].includes(b.latestRefresh.status))
        setRefreshId(b.latestRefresh.id);
    }
  }, [grantId]);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("criteria");
    if (q && q in labels) setFilter(q);
    void load().catch((e) => setError(e.message));
  }, [load]);
  useEffect(() => {
    if (!refreshId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const r = await fetch(`/api/profile/criteria-refresh/${refreshId}`);
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        if (cancelled) return;
        setRefresh(b);
        if (b.status === "completed") {
          setRefreshId(null);
          await load();
          router.refresh();
        } else if (b.status === "failed") {
          setRefreshId(null);
          setError(b.error || "Refresh failed. Retry verification.");
        } else timer = setTimeout(poll, 2500);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Unable to check refresh");
          timer = setTimeout(poll, 5000);
        }
      }
    }
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [refreshId, load, router]);
  async function send(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const b = await r.json();
      if (!r.ok) {
        if (b.refreshId) setRefreshId(b.refreshId);
        throw new Error(b.error);
      }
      setRefreshId(b.refreshId);
      setLastRefreshId(b.refreshId);
      setRefresh({ status: "queued" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }
  const disabled = busy || !!refreshId;
  return (
    <section
      id="verify"
      className="space-y-4 rounded-xl border bg-white p-5 scroll-mt-24"
    >
      <h2 className="text-xl font-bold">Verify eligibility</h2>
      <p className="text-sm">
        Check published requirements against your Business DNA. Confirm only
        what you can support with evidence.
      </p>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {refresh && (
        <div role="status" className="rounded bg-blue-50 p-3">
          {refresh.status === "completed"
            ? `${refresh.result?.rechecked ?? 0} opportunities rechecked; ${refresh.result?.becameStrong ?? 0} became strong matches; ${refresh.result?.leftStrong ?? 0} left strong matches; ${refresh.result?.removed ?? 0} removed.`
            : `${refresh.status}: ${refresh.result?.rechecked ?? 0} rechecked${refresh.result?.total != null ? ` of ${refresh.result.total}` : ""}`}
        </div>
      )}
      {refresh?.status === "failed" && lastRefreshId && (
        <Button
          disabled={disabled}
          onClick={() =>
            void send(`/api/profile/criteria-refresh/${lastRefreshId}`, {})
          }
        >
          Retry refresh
        </Button>
      )}
      {!data ? (
        <p>Loading criteria…</p>
      ) : (
        <>
          <p>{data.assessment.summary}</p>
          {data.document?.sourceUrl && (
            <a
              href={data.document.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue-700 underline"
            >
              Published source · reviewed{" "}
              {new Date(data.document.extractedAt).toLocaleDateString("en-GB")}
            </a>
          )}
          {data.document?.objectives.length ? (
            <details>
              <summary className="cursor-pointer font-semibold">
                Programme objectives
              </summary>
              <ul className="list-disc pl-5">
                {data.document.objectives.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
              <p className="text-sm">
                Compare these published objectives with your project; confirming
                eligibility is separate from strengthening your application.
              </p>
            </details>
          ) : null}
          <div className="rounded border p-3">
            <h3 className="font-semibold">Funding terms</h3>
            {data.document?.terms.length ? (
              data.document.terms.map((t) => (
                <details key={`${t.label}:${t.value}`}>
                  <summary>
                    {t.label}: {t.value}
                  </summary>
                  <blockquote>{t.excerpt}</blockquote>
                </details>
              ))
            ) : (
              <p>
                Funding type, award basis, co-funding, repayment and equity
                terms are not yet confirmed.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Filter criteria">
            <Button
              variant="outline"
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
            >
              All
            </Button>
            {(Object.keys(labels) as CriterionStatus[]).map((s) => (
              <Button
                key={s}
                variant="outline"
                aria-pressed={filter === s}
                onClick={() => setFilter(s)}
              >
                {labels[s]} ({data.assessment.counts[s]})
              </Button>
            ))}
          </div>
          {data.assessment.criteria
            .filter((c) => filter === "all" || c.status === filter)
            .map((c) => (
              <div key={c.id} className="space-y-2 rounded-lg border p-3">
                <span
                  className={`rounded px-2 py-1 text-sm ${colours[c.status]}`}
                >
                  {labels[c.status]}
                  {c.mandatory ? " · Required" : " · Optional"}
                </span>
                <h3 className="font-semibold">{c.label}</h3>
                <blockquote className="border-l-2 pl-3 text-sm">
                  {c.excerpt}
                </blockquote>
                <p className="text-sm">{c.explanation}</p>
                {c.field && (
                  <details>
                    <summary className="cursor-pointer text-blue-700">
                      {c.actual == null
                        ? "Add reusable business fact"
                        : "Edit saved business fact"}
                    </summary>
                    <form
                      className="mt-2 flex flex-wrap gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void send("/api/profile/quick-facts", {
                          grantId,
                          fields: { [c.field!]: f.get("fact") },
                        });
                      }}
                    >
                      <label className="text-sm">
                        {c.field}
                        <input
                          className="ml-2 rounded border p-2"
                          name="fact"
                          required
                          defaultValue={c.actual ?? ""}
                          type={
                            /Date$/.test(c.field)
                              ? "date"
                              : [
                                    "employeeCount",
                                    "annualRevenue",
                                    "coFundingAvailable",
                                  ].includes(c.field)
                                ? "number"
                                : "text"
                          }
                          min={0}
                        />
                      </label>
                      <Button disabled={disabled} type="submit">
                        Save to Business DNA and recheck
                      </Button>
                    </form>
                    <p className="text-xs">
                      This fact is reused across this business&apos;s
                      opportunities.
                    </p>
                  </details>
                )}
                {(c.status === "needs_information" ||
                  c.status === "met" ||
                  c.status === "not_met") && (
                  <details open={c.status === "needs_information"}>
                    <summary className="cursor-pointer">
                      Confirm this requirement for this grant
                    </summary>
                    <form
                      className="mt-2 space-y-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void send(`/api/grants/${grantId}/verify`, {
                          answers: [
                            {
                              criterionId: c.id,
                              sourceVersion: c.sourceVersion,
                              value: f.get("answer") === "yes",
                              evidence: f.get("evidence"),
                            },
                          ],
                        });
                      }}
                    >
                      <p>{c.question}</p>
                      <label className="block">
                        Your answer{" "}
                        <select
                          name="answer"
                          className="rounded border p-2"
                          required
                          defaultValue=""
                        >
                          <option value="" disabled>
                            Select
                          </option>
                          <option value="yes">Yes, with evidence</option>
                          <option value="no">No</option>
                        </select>
                      </label>
                      <label className="block">
                        Evidence or explanation
                        <textarea
                          name="evidence"
                          required
                          maxLength={2000}
                          className="block w-full rounded border p-2"
                        />
                      </label>
                      <Button
                        disabled={disabled || !data.actionable}
                        type="submit"
                      >
                        Confirm and recheck
                      </Button>
                      <p className="text-xs">
                        Saved for this grant only. A confirmation cannot
                        override a failed numerical requirement; correct the
                        saved fact instead.
                      </p>
                    </form>
                  </details>
                )}
              </div>
            ))}
          <Button
            disabled={disabled || !data.actionable}
            onClick={() =>
              void send(`/api/grants/${grantId}/verify`, { reextract: true })
            }
          >
            {data.document
              ? "Review source again and recheck"
              : "Review published requirements"}
          </Button>
          {!data.actionable && (
            <p>
              This listing is not an active individual opportunity. It cannot be
              verified or counted as a match.
            </p>
          )}
          <Link
            href={`/founder-pack?grantId=${grantId}`}
            className="ml-3 text-blue-700 underline"
          >
            Start preparation
          </Link>
        </>
      )}
    </section>
  );
}
