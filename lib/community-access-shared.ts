import { PLAN_LIMITS, type PlanKey } from "./plans";

export const COMMUNITY_ACCESS_DEFAULT_PLAN: PlanKey = "GROWTH";
export const COMMUNITY_ACCESS_DEFAULT_DURATION_DAYS = 90;
export const COMMUNITY_ACCESS_DEFAULT_MAX_REDEMPTIONS = 250;

export function normaliseCommunitySlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function partnerNameFromSlug(slug: string): string {
  const normalised = normaliseCommunitySlug(slug);
  if (normalised === "launchspace") return "LaunchSpace";
  if (normalised === "future-space") return "Future Space";
  return normalised
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function formatCommunityAccessExpiry(value?: string | Date | null): string {
  if (!value) return "not set";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "not set";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function communityAccessUnlocksText(plan: PlanKey): string[] {
  const limits = PLAN_LIMITS[plan];
  return [
    `${plan === "GROWTH" ? "Growth" : plan} access for the pilot period`,
    limits.matchesPerMonth === Infinity ? "Unlimited eligibility scoring" : `${limits.matchesPerMonth} eligibility checks per month`,
    "AI Business DNA generator and website intelligence refresh",
    "Email and WhatsApp strong-match alerts",
    "Founder Pack, auto-improve, and outcome learning",
  ];
}
