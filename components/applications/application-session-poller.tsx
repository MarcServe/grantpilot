"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_INTERVAL_MS = 12_000;

/**
 * Soft-refresh the application detail page while the worker session is active
 * so progress updates without requiring a manual reload when the user returns to the tab.
 */
export function ApplicationSessionPoller({ intervalMs = DEFAULT_INTERVAL_MS }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, router]);

  return null;
}
