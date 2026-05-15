"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, CheckCircle, Circle, ExternalLink, Info } from "lucide-react";
import { updateApplicationTaskStatus } from "@/app/(dashboard)/applications/actions";
import { toast } from "sonner";

export interface ApplicationTaskRow {
  id: string;
  name: string;
  status: string;
  priority: string;
  dueDate: string | null;
  slug?: string | null;
}

interface ApplicationTaskListProps {
  applicationId: string;
  /** Grant id for linking to eligibility / grant detail */
  grantId?: string;
  tasks: ApplicationTaskRow[];
}

const PRIORITY_LABEL: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

function taskRelatedHref(
  taskName: string,
  taskSlug: string | null | undefined,
  grantId: string | undefined,
  applicationId: string
): { href: string; label: string; external: boolean } | null {
  const n = taskName.toLowerCase();
  const slug = taskSlug ?? "";
  if (slug === "review_eligibility" || (n.includes("review") && n.includes("eligibility")) || n === "review eligibility") {
    if (!grantId) return null;
    return { href: `/grants/${grantId}`, label: "View grant & eligibility", external: true };
  }
  if (slug === "generate_prep_documents" || (n.includes("prep") && n.includes("document")) || (n.includes("prepare") && n.includes("document"))) {
    return { href: `/founder-pack?applicationId=${applicationId}`, label: "Generate prep documents", external: true };
  }
  if (slug === "apply_on_funder_website" || (n.includes("apply") && n.includes("funder"))) {
    return {
      href: `/applications/${applicationId}#application-submit`,
      label: "Open submit checklist",
      external: false,
    };
  }
  if (slug === "mark_submitted" || n.includes("mark submitted")) {
    return { href: `/applications/${applicationId}#application-submit`, label: "Mark submitted", external: false };
  }
  if (slug === "record_final_outcome" || n.includes("outcome")) {
    return { href: `/applications/${applicationId}#outcome-learning`, label: "Record outcome", external: false };
  }
  return null;
}

export function ApplicationTaskList({ applicationId, grantId, tasks }: ApplicationTaskListProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleToggle(taskId: string, currentStatus: string) {
    const nextStatus = currentStatus === "done" ? "todo" : "done";
    startTransition(async () => {
      const result = await updateApplicationTaskStatus(taskId, nextStatus);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(nextStatus === "done" ? "Task completed" : "Task reopened");
        router.refresh();
      }
    });
  }

  const TASK_HINTS: Record<string, string> = {
    "review eligibility": "Check that your business meets this grant's criteria and note any evidence gaps.",
    "generate prep documents": "Create funder-ready answers, checklists, and supporting pack documents before applying.",
    "apply on funder website": "Open the official funder form and submit directly on their website or portal.",
    "mark submitted": "After sending the form to the funder, mark it submitted here to stop repeat eligibility nudges.",
    "record final outcome": "When the funder replies, record awarded, rejected, shortlisted, or withdrawn.",
  };

  if (tasks.length === 0) return null;

  const doneCount = tasks.filter((t) => t.status === "done").length;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Your Preparation Checklist</CardTitle>
        <div className="mt-1 flex items-start gap-2 rounded-md bg-blue-50 p-3 text-xs text-blue-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <div className="space-y-1">
            <p className="font-medium">These are tasks for you, not the AI.</p>
            <p>
              Use this checklist to qualify the grant, prepare your documents, submit on the funder site,
              and track the outcome. Tick each item off as you go &mdash; this is{" "}
              <span className="font-medium">optional but strongly advised</span>.
            </p>
            <p>
              The links below open the grant page, Founder Pack, submit checklist, or outcome form.
            </p>
          </div>
        </div>
        {tasks.length > 1 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {doneCount} of {tasks.length} completed
          </p>
        )}
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {tasks.map((task) => {
            const isDone = task.status === "done";
            const related = taskRelatedHref(task.name, task.slug, grantId, applicationId);
            return (
              <li
                key={task.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <Checkbox
                    checked={isDone}
                    onCheckedChange={() => handleToggle(task.id, task.status)}
                    disabled={isPending}
                    className="mt-1"
                  />
                  <div className="min-w-0">
                    <span
                      className={`text-sm font-medium ${isDone ? "text-muted-foreground line-through" : ""}`}
                    >
                      {task.name}
                    </span>
                    {(() => {
                      const hint = TASK_HINTS[task.name.toLowerCase()];
                      return hint && !isDone ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
                      ) : null;
                    })()}
                    {related && !isDone && (
                      <div className="mt-1.5">
                        <Link
                          href={related.href}
                          {...(related.external
                            ? { target: "_blank", rel: "noopener noreferrer" }
                            : {})}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          {related.label}
                          {related.external ? (
                            <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
                          ) : null}
                        </Link>
                      </div>
                    )}
                    {task.dueDate && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        Due {new Date(task.dueDate).toLocaleDateString("en-GB")}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {PRIORITY_LABEL[task.priority] ?? task.priority}
                  </Badge>
                  {isDone ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
