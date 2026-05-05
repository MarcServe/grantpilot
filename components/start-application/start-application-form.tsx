"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

interface StartApplicationFormProps {
  token: string;
  grantName: string;
}

export function StartApplicationForm({ grantName }: StartApplicationFormProps) {
  const router = useRouter();

  return (
    <div className="mt-6 space-y-3">
      <Button
        onClick={() => router.push(`/sign-in?redirect=${encodeURIComponent("/grants/eligible")}`)}
        className="w-full gap-2"
      >
        <CheckCircle className="h-4 w-4" />
        Sign in to prepare application
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        No application will be auto-started from this link. Auto-filing for {grantName} is a Version 2 workflow.
      </p>
    </div>
  );
}
