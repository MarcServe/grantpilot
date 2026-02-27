"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, FileCheck } from "lucide-react";
import { toast } from "sonner";

interface ApplyButtonProps {
  grantId: string;
  profileId: string;
}

export function ApplyButton({ grantId, profileId }: ApplyButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleApply() {
    setLoading(true);
    try {
      const res = await fetch("/api/applications/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantId, profileId }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Failed to start application");
        return;
      }

      toast.success("Application started! AI is processing your application.");
      setOpen(false);
      router.push(`/applications/${data.applicationId}`);
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <FileCheck className="h-4 w-4" />
          Apply with AI
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start AI Application</DialogTitle>
          <DialogDescription>
            GrantPilot will use your business profile to fill in the grant
            application. The AI will prepare everything and pause for your
            review before any submission.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg bg-muted p-4 text-sm">
          <ul className="space-y-2">
            <li>1. AI opens the grant application form</li>
            <li>2. Fills in company details from your profile</li>
            <li>3. Prepares financial information</li>
            <li>4. Uploads supporting documents</li>
            <li>5. Pauses for your review before submission</li>
          </ul>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Start Application
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
