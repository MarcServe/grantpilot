"use client";
import { useEffect, useState } from "react";
import { LOAN_TASKS, TASK_STATUS, taskSchema, type LoanWorkspace } from "@/lib/start-up-loan-workspace";
import { Button } from "@/components/ui/button";
interface Props { intakeId?: string; revision?: string | null; onSaved?: (updatedAt: string) => void; }
export function LoanPreparationWorkspace({ intakeId, revision, onSaved }: Props) {
  const [workspace,setWorkspace]=useState<LoanWorkspace>({});
  const [version,setVersion]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [reload,setReload]=useState(0);
  const admin=Boolean(intakeId);
  useEffect(()=>{
    const c=new AbortController();setLoading(true);setError("");setVersion("");
    fetch(`/api/loans/start-up-loans/workspace${intakeId?`?intakeId=${encodeURIComponent(intakeId)}`:""}`,{signal:c.signal,cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);setWorkspace(d.workspace);setVersion(d.updatedAt);}).catch(e=>{if(!c.signal.aborted)setError(e instanceof Error?e.message:"Could not load workspace.");}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();
  },[intakeId,revision,reload]);
  async function save(taskId: typeof LOAN_TASKS[number]["id"]) {
    setSaving(true);setError("");setNotice("");
    try{const r=await fetch("/api/loans/start-up-loans/workspace",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({intakeId,taskId,expectedUpdatedAt:version,task:workspace[taskId]??taskSchema.parse({})})});const d=await r.json();if(!r.ok){if(r.status===409)setVersion("");throw new Error(d.error);}setWorkspace(w=>({...w,[taskId]:d.workspace[taskId]}));setVersion(d.updatedAt);setNotice("Task saved. Other unsaved task edits remain in this workspace.");onSaved?.(d.updatedAt);}catch(e){setError(e instanceof Error?e.message:"Could not save task.");}finally{setSaving(false);}
  }
  function update(id: typeof LOAN_TASKS[number]["id"], key: string, value: string){setWorkspace(w=>({...w,[id]:{...taskSchema.parse({}),...w[id],[key]:value}}));setNotice("");}
  return <section aria-label="Loan preparation workspace" className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-6">
    <h2 className="text-xl font-semibold">Your Start Up Loan preparation workspace</h2>
    <p className="text-sm text-muted-foreground">Track six preparation tasks. Progress is separate from lender approval. Adviser names record responsibility; they do not grant access or confirm a review. Share only preparation notes here, not identity numbers or bank details.</p>
    {loading&&<p role="status">Loading preparation progress…</p>}{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{notice&&<p role="status" className="text-sm text-emerald-800">{notice}</p>}
    <Button type="button" variant="outline" disabled={saving||loading} onClick={()=>{if(window.confirm("Reload saved tasks? Unsaved task edits will be discarded."))setReload(v=>v+1);}}>Reload saved tasks</Button>
    <fieldset disabled={loading||saving||!version} className="grid min-w-0 gap-4 md:grid-cols-2">
      {LOAN_TASKS.map((item,index)=>{const task=workspace[item.id]??taskSchema.parse({});return <article key={item.id} className="min-w-0 space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
        <h3 className="font-semibold">{index+1}. {item.title}</h3><p className="text-xs">Responsibility: {task.assignee||item.owner}</p><p className="text-sm">{item.next}</p>
        <label className="block space-y-1 text-sm"><span>Preparation status</span><select className="min-h-10 w-full rounded-md border bg-background p-2" value={task.status} onChange={e=>update(item.id,"status",e.target.value)}>{Object.entries(TASK_STATUS).filter(([key])=>!admin||key!=="applicant_approved"||task.status==="applicant_approved").map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        {admin?<><label className="block space-y-1 text-sm"><span>Assigned adviser / partner (responsibility only)</span><input maxLength={160} className="min-h-10 w-full rounded-md border bg-background p-2" value={task.assignee} onChange={e=>update(item.id,"assignee",e.target.value)} /></label><label className="block space-y-1 text-sm"><span>Due date</span><input type="date" className="min-h-10 w-full rounded-md border bg-background p-2" value={task.dueDate} onChange={e=>update(item.id,"dueDate",e.target.value)} /></label></>:task.dueDate?<p className="text-sm">Due: {task.dueDate}</p>:null}
        <label className="block space-y-1 text-sm"><span>Preparation note (shared when adviser consent is on)</span><textarea maxLength={2000} rows={3} className="w-full rounded-md border bg-background p-2" value={task.note} onChange={e=>update(item.id,"note",e.target.value)} /></label>
        {task.updatedAt&&<p className="text-xs text-muted-foreground">Last saved by {task.updatedBy} · {new Date(task.updatedAt).toLocaleString("en-GB",{timeZone:"Europe/London"})}</p>}
        <div className="flex flex-wrap gap-2"><Button type="button" onClick={()=>save(item.id)}>Save task</Button>{!admin&&<a className="inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium text-primary" href={`#loan-${item.field}`} onClick={()=>{const el=document.getElementById(`loan-${item.field}`);const details=el?.closest("details");if(details)details.open=true;requestAnimationFrame(()=>el?.focus());}}>Complete inputs →</a>}</div>
      </article>;})}
    </fieldset>
    <p className="text-xs text-muted-foreground">A draft or checked task is not verified evidence. Applicant approval means ready for preparation, not a credit decision or consent to submit. Business plans, forecasts and personal budgets must be checked together before use.</p>
    <a href="https://apply.startuploans.co.uk/" target="_blank" rel="noopener noreferrer" className="inline-block text-sm font-semibold text-primary underline">Continue on the official Start Up Loans portal ↗</a>
  </section>;
}
