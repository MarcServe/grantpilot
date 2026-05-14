"use client";

import { useState } from "react";
import type { MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  FILLING: "bg-blue-100 text-blue-800",
  REVIEW_REQUIRED: "bg-purple-100 text-purple-800",
  APPROVED: "bg-green-100 text-green-800",
  SUBMITTED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  STOPPED: "bg-slate-100 text-slate-700",
};

interface ApplicationCardWithDeleteProps {
  id: string;
  grantName: string;
  funder: string;
  displayStatus: string;
  createdAt: string;
  /** Highlight submitted apps still missing a terminal outcome */
  needsOutcomeReminder?: boolean;
  canMarkSubmitted?: boolean;
}

export function ApplicationCardWithDelete({
  id,
  grantName,
  funder,
  displayStatus,
  createdAt,
  needsOutcomeReminder,
  canMarkSubmitted,
}: ApplicationCardWithDeleteProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [markingSubmitted, setMarkingSubmitted] = useState(false);

  async function handleDelete() {
    try {
      const res = await fetch(`/api/applications/${id}/delete`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to remove");
        return;
      }
      toast.success("Application removed from your list");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    }
  }

  async function handleMarkSubmitted(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    setMarkingSubmitted(true);
    try {
      const res = await fetch(`/api/applications/${id}/mark-submitted`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to mark submitted");
        return;
      }
      toast.success("Application marked as submitted");
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setMarkingSubmitted(false);
    }
  }

  return (
    <>
      <Card className="transition-colors hover:bg-muted/50 group">
        <CardContent className="flex items-center justify-between p-4">
          <Link href={`/applications/${id}`} className="min-w-0 flex-1">
            <div className="flex items-center gap-4">
              <div>
                <p className="font-medium">{grantName}</p>
                <p className="text-sm text-muted-foreground">{funder}</p>
              </div>
            </div>
          </Link>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
            {needsOutcomeReminder && (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">
                Outcome?
              </Badge>
            )}
            <Badge variant="secondary" className={STATUS_COLORS[displayStatus] ?? ""}>
              {displayStatus.replace(/_/g, " ")}
            </Badge>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {new Date(createdAt).toLocaleDateString("en-GB")}
            </div>
            {canMarkSubmitted && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                onClick={handleMarkSubmitted}
                disabled={markingSubmitted}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {markingSubmitted ? "Saving..." : "Mark submitted"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
              title="Remove from list"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this application?</DialogTitle>
            <DialogDescription>
              This will permanently remove &quot;{grantName}&quot; from your list. You can start a new application for this grant from the Grants page anytime.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
