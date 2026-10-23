"use client";
import { useEffect, useState, useCallback } from "react";
import type { CriteriaDocument } from "@/lib/criteria";
import { Button } from "@/components/ui/button";
type Data = {
  workload: CriteriaDocument["workload"];
  sourceVersion: string;
  coverage: string;
  checks: { requirement_id: string; status: string; evidence: string }[];
  documents: { id: string; name: string }[];
};
export function PreparationChecklist({ grantId }: { grantId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch(`/api/grants/${grantId}/preparation`);
    const b = await r.json();
    if (!r.ok) throw new Error(b.error);
    setData(b);
  }, [grantId]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);
  return (
    <section
      id="readiness"
      className="space-y-3 rounded-xl border bg-white p-5"
    >
      <h2 className="text-xl font-bold">Improve readiness</h2>
      <p>
        Eligibility asks whether you can apply. Readiness tracks the evidence
        and documents you still need. Generated drafts count only after review.
      </p>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {data && (
        <>
          <p>
            {data.checks.filter((c) => c.status === "reviewed").length} reviewed
            ·{" "}
            {data.workload.length -
              data.checks.filter((c) => c.status === "reviewed").length}{" "}
            still needed
          </p>
          <p className="text-sm">
            Reusable documents available:{" "}
            {data.documents.map((d) => d.name).join(", ") || "None uploaded"}.
            Availability alone does not confirm that a document meets a funder
            requirement.
          </p>
          {data.coverage !== "complete" && (
            <p>Source review incomplete. Further requirements may exist.</p>
          )}
          {!data.workload.length && (
            <p>
              Application questions and attachments have not been confirmed.
              Review the published source or paste the funder&apos;s
              requirements into Founder Pack.
            </p>
          )}
          {data.workload.map((w) => {
            const check = data.checks.find((c) => c.requirement_id === w.id);
            return (
              <form
                key={`${w.id}:${check?.status}`}
                className="space-y-2 rounded border p-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  setBusy(true);
                  setError("");
                  try {
                    const r = await fetch(
                      `/api/grants/${grantId}/preparation`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          requirementId: w.id,
                          sourceVersion: data.sourceVersion,
                          status: f.get("status"),
                          evidence: f.get("evidence"),
                        }),
                      },
                    );
                    const b = await r.json();
                    if (!r.ok) throw new Error(b.error);
                    await load();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Could not save");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <h3 className="font-semibold">{w.label}</h3>
                <p className="text-sm">{w.excerpt}</p>
                <label>
                  Status{" "}
                  <select
                    name="status"
                    defaultValue={check?.status ?? "needed"}
                    className="rounded border p-2"
                  >
                    <option value="needed">Needed</option>
                    <option value="draft">Draft — not reviewed</option>
                    <option value="reviewed">Reviewed with evidence</option>
                  </select>
                </label>
                <label className="block">
                  Evidence reference or review notes
                  <textarea
                    name="evidence"
                    defaultValue={check?.evidence ?? ""}
                    maxLength={2000}
                    className="block w-full rounded border p-2"
                  />
                </label>
                <Button disabled={busy} type="submit">
                  Save progress
                </Button>
              </form>
            );
          })}
        </>
      )}
    </section>
  );
}
