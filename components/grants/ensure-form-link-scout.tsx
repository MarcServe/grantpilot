"use client";

import { useEffect, useRef } from "react";
import { isLikelyProgrammeInfoUrl } from "@/lib/grant-url-validation";

const ELIGIBILITY_THRESHOLD = 50;

interface EnsureFormLinkScoutProps {
  grantId: string;
  applicationUrl: string;
  eligibilityScore: number | null;
}

/**
 * When eligibility is good and the grant URL is a programme page, enqueue a Scout job
 * so the worker (Playwright) discovers the real application form link. That makes
 * "Apply with AI" use the correct form URL when the user clicks it.
 */
export function EnsureFormLinkScout({ grantId, applicationUrl, eligibilityScore }: EnsureFormLinkScoutProps) {
  const enqueued = useRef(false);

  useEffect(() => {
    if (enqueued.current || !grantId || !applicationUrl?.trim()) return;
    const score = eligibilityScore ?? 0;
    if (score < ELIGIBILITY_THRESHOLD) return;
    if (!isLikelyProgrammeInfoUrl(applicationUrl.trim())) return;

    enqueued.current = true;
    fetch(`/api/grants/${grantId}/scout-form-link`, { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (data.status === "pending" || data.status === "running") {
          // Worker will pick up and update Grant.applicationUrl when done
        }
      })
      .catch(() => {
        enqueued.current = false;
      });
  }, [grantId, applicationUrl, eligibilityScore]);

  return null;
}
