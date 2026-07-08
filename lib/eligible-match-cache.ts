import { clearServerCache } from "@/lib/server-cache";

export function clearEligibleMatchCaches(): void {
  clearServerCache("eligible-match-tier:");
  clearServerCache("eligible-match-assessments:");
  clearServerCache("eligible-match-grant-ordered-assessments:");
}
