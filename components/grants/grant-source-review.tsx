"use client";
import { useRouter } from "next/navigation";
import { sourceReviewErrorMessage } from "@/lib/source-review-errors";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { CriteriaAssessment, CriteriaDocument } from "@/lib/criteria";
import { Button } from "@/components/ui/button";

type Review = { document: CriteriaDocument | null; assessment: CriteriaAssessment | null; storageReady: boolean };
export function GrantSourceReview({ grantId }: { grantId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Review | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/grants/${grantId}/source-review`, { signal: controller.signal }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Source review unavailable");
      setData(body);
    }).catch((error) => { if (!controller.signal.aborted) setError(sourceReviewErrorMessage(error)); });
    return () => controller.abort();
  }, [grantId]);
  async function review() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/grants/${grantId}/source-review`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Source review failed");
      setData(body);
      window.dispatchEvent(new CustomEvent("grant:source-reviewed", { detail: { grantId, assessment: body.assessment } }));
      router.refresh();
    } catch (error) { setError(sourceReviewErrorMessage(error)); }
    finally { setBusy(false); }
  }
  const doc = data?.document;
  return <section id="published-requirements" className="min-w-0 space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
    <h2 className="text-lg font-semibold">Published requirements and preparation</h2>
    <p className="text-sm">Check what the funder actually requires before relying on a fit score. Company registration and sector match are only part of eligibility.</p>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {data?.storageReady === false && <p className="text-sm text-amber-900">Source review storage needs Supabase migration 065. No complete review is claimed.</p>}
    {!doc && <p className="text-sm font-medium">{data ? "Published source not reviewed here yet. The existing score may be based on stored summaries." : "Loading source review status…"}</p>}
    <Button type="button" variant="outline" disabled={busy || data?.storageReady === false} onClick={review} className="h-auto max-w-full whitespace-normal">
      {busy ? "Reading published guidance and extracting requirements…" : doc ? "Read published guidance again" : "Read published guidance and requirements"}
    </Button>
    {doc && <>
      <p className="text-sm"><a href={doc.sourceUrl} target="_blank" rel="noreferrer" className="break-all text-blue-800 underline">Reviewed source</a> · {new Date(doc.extractedAt).toLocaleString("en-GB")} · {doc.sourceText?.length.toLocaleString("en-GB") ?? "Unknown"} characters read</p>
      {!doc.sourceText && <p className="text-sm text-amber-900">This older review did not retain the full page text. Read the published guidance again to connect it to answer preparation.</p>}
      <p className="text-sm font-medium">Coverage: {data.assessment?.coverage === "complete" ? "Published eligibility on this page reviewed" : "Partial — further guidance may apply"}. Linked PDFs and login-only pages need separate review.</p>
      {doc.organisationStatus === "source_only" && <p role="status" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">Published guidance loaded. Automated organisation is incomplete; read the source sections below. No eligibility requirements have been confirmed by this extraction.</p>}
      {!!doc.extractionWarnings?.length && <details><summary className="cursor-pointer text-sm font-semibold">Extraction limitations ({doc.extractionWarnings.length})</summary><ul className="list-disc space-y-1 pl-5 text-xs">{doc.extractionWarnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
      {doc.sourceText && <details open={doc.organisationStatus === "source_only"}><summary className="cursor-pointer font-semibold">Read the fetched published guidance</summary><div className="mt-2 space-y-2">{(doc.sourceSections?.length ? doc.sourceSections : [{ heading: "Published guidance", text: doc.sourceText }]).map((section, index) => <details key={index} open={doc.organisationStatus === "source_only" && /eligibility|scope|published guidance/i.test(section.heading)} className="rounded-md border bg-white p-3"><summary className="cursor-pointer text-sm font-semibold">{section.heading}</summary><p className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap break-words text-sm">{section.text}</p></details>)}</div></details>}
      {!!doc.unreviewedLinks?.length && <details><summary className="cursor-pointer text-sm font-semibold">Linked PDFs not reviewed ({doc.unreviewedLinks.length})</summary>
        <ul className="list-disc space-y-1 pl-5">{doc.unreviewedLinks.map((url) => <li key={url}><a className="break-all text-xs text-blue-800 underline" href={url} target="_blank" rel="noreferrer">{url}</a></li>)}</ul>
      </details>}
      {data.assessment && doc.criteria.length > 0 && <p className="text-sm">{data.assessment.counts.met} met · {data.assessment.counts.needs_information} need information · {data.assessment.counts.not_met} not met. A requirement marked “needs information” is not a confirmed match.</p>}
      {doc.criteria.length > 0 && <details open><summary className="cursor-pointer font-semibold">Eligibility and scope checks ({doc.criteria.length})</summary>
        <ul className="mt-2 space-y-2">{doc.criteria.map((criterion) => <li key={criterion.id} className="rounded-md border bg-white p-3 text-sm">
          <strong>{criterion.label}</strong> · {data.assessment?.criteria.find((item) => item.id === criterion.id)?.status.replace(/_/g, " ") ?? "Needs review"}
          <blockquote className="mt-1 border-l-2 border-blue-200 pl-2 text-xs text-slate-700">{criterion.excerpt}</blockquote>
          <div className="mt-2 flex flex-wrap gap-2"><Button asChild size="sm" variant="outline" className="h-auto whitespace-normal"><Link href={`/grant-assistant?grantId=${encodeURIComponent(grantId)}&criterionId=${encodeURIComponent(criterion.id)}`}>Draft response for this requirement</Link></Button><Button asChild size="sm" variant="outline" className="h-auto whitespace-normal"><Link href={`/grant-assistant?grantId=${encodeURIComponent(grantId)}&criterionId=${encodeURIComponent(criterion.id)}&draftKind=document`}>Create supporting draft or evidence plan</Link></Button></div>
        </li>)}</ul>
      </details>}
      <details><summary className="cursor-pointer font-semibold">Application questions and deliverables ({doc.workload.length})</summary>
        <ul className="mt-2 space-y-2">{doc.workload.map((item) => <li key={item.id} className="space-y-2 rounded-md border bg-white p-3 text-sm">
          <p className="font-semibold">{item.label}{item.wordLimit ? ` · ${item.wordLimit} words maximum` : ""}</p>
          <p className="whitespace-pre-wrap text-xs">{item.excerpt}</p>
          <Button asChild size="sm" variant="outline" className="h-auto whitespace-normal"><Link href={`/grant-assistant?grantId=${encodeURIComponent(grantId)}&requirementId=${encodeURIComponent(item.id)}`}>{item.kind === "question" ? "Draft this answer" : "Create this document draft"}</Link></Button>
        </li>)}</ul>
      </details>
      <p className="text-xs text-slate-700">The assistant can draft answers, plans and document outlines. Prototypes, benchmark results, CV facts, IP rights and confirmed funding need actual evidence; generated text does not satisfy them by itself.</p>
      <div className="flex flex-wrap gap-2"><Button asChild className="h-auto whitespace-normal"><Link href={`/grant-assistant?grantId=${encodeURIComponent(grantId)}`}>{doc.workload.some(item => item.kind === "question") ? "Draft the published application questions" : "Open assistant with this source context"}</Link></Button>
        <Button asChild variant="outline" className="h-auto whitespace-normal"><Link href={`/grant-assistant?grantId=${encodeURIComponent(grantId)}&prepare=documents`}>Draft supporting documents</Link></Button>
        <Button asChild variant="outline"><Link href={`/founder-pack?grantId=${encodeURIComponent(grantId)}`}>Prepare a grant-specific pack</Link></Button></div>
    </>}
  </section>;
}
