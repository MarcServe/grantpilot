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
  grantId: string | undefined,
  applicationId: string
): { href: string; label: string; external: boolean } | null {
  const n = taskName.toLowerCase();
  if ((n.includes("review") && n.includes("eligibility")) || n === "review eligibility") {
    if (!grantId) return null;
    return { href: `/grants/${grantId}`, label: "View grant & eligibility", external: true };
  }
  if (n.includes("prepare") && n.includes("document")) {
    return { href: "/profile?step=5", label: "Open documents (profile)", external: true };
  }
  if (n.includes("submit")) {
    return {
      href: `/applications/${applicationId}#application-submit`,
      label: "Jump to submit section",
      external: false,
    };
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
    "review eligibility": "Check that your business meets this grant's criteria before the AI submits on your behalf.",
    "prepare documents": "Upload any required documents (business plan, financials, pitch deck) to your profile.",
    "submit application": "Once the AI has filled the form, review the answers and approve the final submission.",
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
              While our AI handles the form filling automatically, we recommend you complete these
              preparation steps to improve your chances of success. Tick each item off as you go
              &mdash; this is <span className="font-medium">optional but strongly advised</span>.
            </p>
            <p>
              Use the links below to open the grant page, your profile documents, or the submit section.
              Your application keeps running in the background &mdash; you are not stuck on this page.
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
            const related = taskRelatedHref(task.name, grantId, applicationId);
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
