"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ExpertGrantReview } from "@/lib/expert-grant-review";
type Row = ExpertGrantReview & { Application?: unknown; evidence?: { outcome?: string; funderFeedback?: string; responseText?: string } | null };
export function ExpertReviewQueue() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/admin/expert-reviews", { signal: c.signal }).then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error); setRows(data.reviews); }).catch(e => { if (!c.signal.aborted) setError(String(e.message ?? e)); }).finally(() => { if (!c.signal.aborted) setLoading(false); });
    return () => c.abort();
  }, []);
  return <div className="space-y-4">{loading && <p role="status">Loading requests…</p>}{error && <p role="alert">{error}</p>}{!loading && !error && rows.length === 0 && <p>No expert review requests yet.</p>}{rows.map(row => <Review key={`${row.id}:${row.updatedAt}`} row={row} onSaved={saved => setRows(r => r.map(item => item.id === saved.id ? { ...item, ...saved } : item))} />)}</div>;
}
function Review({ row, onSaved }: { row: Row; onSaved: (r: ExpertGrantReview) => void }) {
  const [name, setName] = useState(row.reviewerName ?? "");
  const [expertise, setExpertise] = useState(row.reviewerExpertise ?? "");
  const [refs, setRefs] = useState((row.trackRecordReferences ?? []).join("\n"));
  const [advice, setAdvice] = useState(row.advice ?? "");
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(status: "in_review" | "completed") {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/expert-reviews", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, expectedUpdatedAt: row.updatedAt, status, reviewerName: name, reviewerExpertise: expertise, trackRecordReferences: refs.split("\n").map(s => s.trim()).filter(Boolean), advice, verifiedTrackRecord: verified }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error); onSaved(data.review);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the review."); } finally { setBusy(false); }
  }
  return <details className="rounded-xl border bg-card p-4"><summary className="cursor-pointer font-semibold">Application {row.applicationId} · {row.status.replaceAll("_", " ")}</summary><div className="mt-4 space-y-4">
    <p className="text-xs text-muted-foreground">Requested {new Date(row.requestedAt).toLocaleDateString("en-GB")}. Inspect the saved outcome before giving advice; no cause of rejection is established by status alone.</p>
    <div className="whitespace-pre-wrap rounded-md border p-3 text-sm">Business and grant context:<pre className="mt-2 whitespace-pre-wrap break-words">{JSON.stringify(row.Application, null, 2)}</pre>Saved outcome: {row.evidence?.outcome ?? "Not available"}<br />{row.evidence?.funderFeedback || "No funder feedback supplied."}<br />{row.evidence?.responseText}</div>
    <label className="block space-y-1 text-sm">Expert name<Input value={name} onChange={e => setName(e.target.value)} disabled={busy} /></label>
    <label className="block space-y-1 text-sm">Relevant grant expertise and successful application experience<Textarea value={expertise} onChange={e => setExpertise(e.target.value)} disabled={busy} /></label>
    <label className="block space-y-1 text-sm">Track-record reference links (one per line, up to five)<Textarea value={refs} onChange={e => setRefs(e.target.value)} disabled={busy} placeholder="Public case study, professional profile or consented evidence link" /></label>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} disabled={busy} className="mt-1" />I checked this person&apos;s relevant grant track record and have permission to publish their name, references and advice to the applicant. I am recording their actual advice, not relabelling AI output as expert-reviewed.</label>
    <label className="block space-y-1 text-sm">Expert advisory report<Textarea rows={10} value={advice} onChange={e => setAdvice(e.target.value)} disabled={busy} placeholder="What the feedback establishes; what is uncertain; evidence gaps; prioritised fixes; resubmission or alternative-funding options. Attribute any claims and identify the next step." /></label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex flex-wrap gap-2"><Button disabled={busy || !verified} variant="outline" onClick={() => save("in_review")}>Assign / save review draft</Button><Button disabled={busy || !verified} onClick={() => save("completed")}>Publish expert advice</Button></div>
  </div></details>;
}
