"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ExpertGrantReview } from "@/lib/expert-grant-review";
export function ExpertReviewPanel({ applicationId }: { applicationId: string }) {
  const [review, setReview] = useState<ExpertGrantReview | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/applications/${applicationId}/expert-review`, { signal: controller.signal }).then(async res => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load the review.");
      setReview(data.review);
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load the review."); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [applicationId]);
  async function request() {
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/applications/${applicationId}/expert-review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consent }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not request a review.");
      setReview(data.review);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not request a review."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-lg border border-teal-200 bg-teal-50/50 p-4" aria-label="Expert advisory review">
    <h3 className="font-semibold">Expert advisory review</h3>
    <p className="text-sm text-muted-foreground">Get a human assessment alongside AI guidance. Reviews are subject to expert availability; no adviser or turnaround is promised until a reviewer is assigned.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {review ? <>
      <p role="status" className="text-sm font-medium">{review.status === "requested" ? "Requested — awaiting an available expert" : review.status === "in_review" ? "Assigned — review in progress" : "Expert advice recorded by the administrator"}</p>
      {review.reviewerName && <p className="text-sm"><strong>{review.reviewerName}</strong> · {review.reviewerExpertise}</p>}
      {review.trackRecordReferences?.length > 0 && <div className="text-sm"><p>Track-record references checked by the administrator:</p><ul className="list-disc pl-5">{review.trackRecordReferences.map((url, i) => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline">Reference {i + 1} ↗</a></li>)}</ul></div>}
      {review.status === "completed" && <>
        {review.reviewedAt && <p className="text-xs text-muted-foreground">Recorded {new Date(review.reviewedAt).toLocaleDateString("en-GB")}</p>}
        <p className="whitespace-pre-wrap break-words text-sm">{review.advice}</p>
        <p className="text-xs text-muted-foreground">This advice is a human review recorded by your administrator. It is separate from AI output and does not guarantee funding. Save your feedback again to include it in the next AI advisory analysis.</p>
      </>}
    </> : <>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} className="mt-1" />I agree that the administrator and assigned adviser may review my saved application feedback and business context for this request.</label>
      <Button type="button" onClick={request} disabled={busy || !consent}>{busy ? "Loading…" : "Request expert review"}</Button>
      <p className="text-xs text-muted-foreground">Save the rejected outcome and feedback first. This creates an in-app request; it does not send your information to external advisers automatically.</p>
    </>}
  </section>;
}
