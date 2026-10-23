"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { FounderPackQuestionAnswer, FounderPackQuestionAssistantMode } from "@/lib/founder-pack";
import { parseQuestionBlocks, questionAssistantRequestSchema } from "@/lib/validations/question-assistant";
import { ApplicationUpgradeDialog } from "@/components/billing/application-upgrade-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Draft = { question: string; context: string; guidance: string; wordLimit: string; existingAnswer: string; mode: FounderPackQuestionAssistantMode };
const EMPTY: Draft = { question: "", context: "", guidance: "", wordLimit: "", existingAnswer: "", mode: "draft_answer" };

export function QuestionAssistant({ profileId, businessName, allowed, previewAvailable, grantId, draftScope }: {
  profileId: string; businessName: string; allowed: boolean; previewAvailable: boolean; grantId?: string; draftScope: string;
}) {
  const router = useRouter();
  const draftKey = `grantpilot.question-assistant.v1:${draftScope}`;
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [restored, setRestored] = useState(false);
  const [answers, setAnswers] = useState<FounderPackQuestionAnswer[]>([]);
  const [previewUsed, setPreviewUsed] = useState(!previewAvailable);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const next = { ...EMPTY };
        for (const key of Object.keys(EMPTY) as (keyof Draft)[]) {
          if (typeof parsed.draft?.[key] === "string" && key !== "mode") next[key] = parsed.draft[key];
        }
        if (["draft_answer", "evidence_check", "improve_existing_answer"].includes(parsed.draft?.mode)) next.mode = parsed.draft.mode;
        setDraft(next);
        if (Array.isArray(parsed.answers)) setAnswers(parsed.answers);
      }
    } catch { /* Editing works when browser storage is disabled. */ }
    setRestored(true);
  }, [draftKey]);
  useEffect(() => {
    if (!restored) return;
    try { window.sessionStorage.setItem(draftKey, JSON.stringify({ draft, answers })); } catch { /* Optional persistence. */ }
  }, [draft, answers, draftKey, restored]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("billing") !== "success") return;
    const controller = new AbortController();
    fetch("/api/billing/sync", { method: "POST", signal: controller.signal }).then(async (res) => {
      if (!res.ok) throw new Error("Subscription confirmation is pending. Please refresh shortly.");
      router.replace("/question-assistant");
      router.refresh();
      toast.success("Subscription confirmed. Continue with your question.");
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [router]);
  function update(key: keyof Draft, value: string) { setDraft((current) => ({ ...current, [key]: value })); }
  async function generate() {
    setError(null);
    const parsed = questionAssistantRequestSchema.safeParse({
      profileId, eligibleGrantId: grantId || undefined, questions: parseQuestionBlocks(draft.question).map((question) => ({
        question, wordLimit: draft.wordLimit.trim() ? Number(draft.wordLimit) : undefined, guidance: draft.guidance.trim() || undefined,
      })), pastedGrantContext: draft.context.trim() || undefined, outputMode: draft.mode, existingAnswer: draft.existingAnswer.trim() || undefined,
    });
    if (!parsed.success) { setError(parsed.error.issues.map((issue) => issue.message).join(" ")); return; }
    if (!allowed && (previewUsed || parsed.data.questions.length > 1)) { setUpgradeOpen(true); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/founder-pack/question-assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402) setUpgradeOpen(true);
        throw new Error(data.error ?? "Could not generate an answer. Please try again.");
      }
      if (!Array.isArray(data.answers) || !data.answers.length) throw new Error("No answer returned. Add more business or grant context and try again.");
      setAnswers(data.answers);
      if (data.progressiveAccess?.previewUsed) setPreviewUsed(true);
      toast.success("Your grant answer is ready");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not connect. Your question is still saved here."); }
    finally { setLoading(false); }
  }
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <ApplicationUpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} returnTo="/question-assistant" />
      <div><h1 className="text-2xl font-bold">AI Question Assistant</h1><p className="mt-2 text-sm text-muted-foreground">Draft answers using {businessName}’s saved Business DNA. Paste the question and funder guidance below.</p><Link href="/profile" className="text-sm text-primary underline">Review business information</Link></div>
      <Card><CardHeader><CardTitle className="text-base">Your grant question</CardTitle></CardHeader><CardContent className="space-y-4">
        {!allowed && <p className="text-sm text-muted-foreground">{previewUsed ? "Your free preview has been used. A paid plan is needed for more answers." : "Try one question free. Review the answer before upgrading for more."}</p>}
        <div className="space-y-2"><Label htmlFor="assistant-question">Question and its guidance</Label><Textarea id="assistant-question" rows={8} value={draft.question} onChange={(e) => update("question", e.target.value)} placeholder="Paste the full question, including answer options or explanatory paragraphs." /><p className="text-xs text-muted-foreground">Up to 12,000 characters per question. For multiple questions, separate them with a line containing --- .</p></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="assistant-mode">What would you like to do?</Label><select id="assistant-mode" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.mode} onChange={(e) => update("mode", e.target.value)}><option value="draft_answer">Draft an answer</option><option value="evidence_check">Check evidence</option><option value="improve_existing_answer">Improve an existing answer</option></select></div><div className="space-y-2"><Label htmlFor="assistant-limit">Word limit (optional)</Label><Input id="assistant-limit" type="number" min={30} max={1500} value={draft.wordLimit} onChange={(e) => update("wordLimit", e.target.value)} placeholder="e.g. 500" /></div></div>
        {draft.mode === "improve_existing_answer" && <div className="space-y-2"><Label htmlFor="assistant-existing">Existing answer</Label><Textarea id="assistant-existing" rows={5} value={draft.existingAnswer} onChange={(e) => update("existingAnswer", e.target.value)} /></div>}
        <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Add funder context or extra guidance (optional)</summary><div className="mt-3 space-y-4"><div className="space-y-2"><Label htmlFor="assistant-context">Funder criteria or grant context</Label><Textarea id="assistant-context" value={draft.context} onChange={(e) => update("context", e.target.value)} /><p className="text-xs text-muted-foreground">Up to 8,000 characters.</p></div><div className="space-y-2"><Label htmlFor="assistant-guidance">Extra answer guidance</Label><Textarea id="assistant-guidance" value={draft.guidance} onChange={(e) => update("guidance", e.target.value)} /><p className="text-xs text-muted-foreground">Up to 4,000 characters.</p></div></div></details>
        {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <Button onClick={generate} disabled={loading || !restored || !draft.question.trim()} className="w-full gap-2">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{loading ? "Drafting your answer…" : !allowed && previewUsed ? "View plans to continue" : "Generate answer"}</Button>
      </CardContent></Card>
      {answers.map((answer, index) => <Card key={index}><CardHeader><CardTitle className="text-base">{answers.length > 1 ? `Answer ${index + 1}` : "Your draft answer"}</CardTitle></CardHeader><CardContent className="space-y-4"><p className="whitespace-pre-wrap text-sm leading-7">{answer.draftAnswer}</p><Button variant="outline" className="gap-2" onClick={async () => { try { await navigator.clipboard.writeText(answer.draftAnswer); toast.success("Answer copied"); } catch { toast.error("Could not copy. Select and copy the answer text."); } }}><Copy className="h-4 w-4" />Copy answer</Button><p className="text-xs text-muted-foreground">{answer.draftAnswer.trim().split(/\s+/).length} words · {answer.draftAnswer.length} characters</p><details><summary className="cursor-pointer text-sm font-medium">Evidence and reasoning</summary><div className="mt-2 space-y-2 text-sm"><p>{answer.rationale}</p><p>Evidence: {answer.evidenceStrength} · Confidence: {answer.confidence}</p>{answer.missingEvidence?.map((item) => <p key={item}>Missing evidence: {item}</p>)}{answer.warnings?.map((item) => <p key={item} className="text-amber-800">{item}</p>)}</div></details></CardContent></Card>)}
      <p className="text-xs text-muted-foreground">Review facts and evidence before submitting to a funder. Need budgets, workplans or documents? <Link href="/founder-pack" className="text-primary underline">Open Application Packs</Link></p>
    </div>
  );
}
