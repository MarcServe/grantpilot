import { getGrantFreshnessStatus, type GrantFreshnessStatus } from "@/lib/grant-freshness";
import { checkUrlHealth, type HealthCheckResult } from "@/lib/url-health-check";

export type GrantActionabilityInput = {
  id?: string | null;
  name?: string | null;
  funder?: string | null;
  deadline?: string | Date | null;
  applicationUrl?: string | null;
  url_status?: string | null;
  urlStatus?: string | null;
  eligibility?: string | null;
  description?: string | null;
  objectives?: string | null;
};

export type GrantActionabilityStatus = GrantFreshnessStatus & {
  requiresLiveVerification: boolean;
};

type SupabaseUpdateClient = {
  from: (table: string) => {
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => PromiseLike<unknown>;
    };
  };
};

type LiveCheck = (url: string, context: GrantActionabilityInput) => Promise<HealthCheckResult>;

function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseDateValue(value?: string | Date | null): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function hasFutureDeadline(deadline?: string | Date | null, now = new Date()): boolean {
  const parsed = parseDateValue(deadline);
  return Boolean(parsed && startOfDay(parsed) >= startOfDay(now));
}

export function getGrantActionabilityStatus(
  grant: GrantActionabilityInput,
  now = new Date()
): GrantActionabilityStatus {
  const freshness = getGrantFreshnessStatus(grant, now);
  if (!freshness.usable) {
    return {
      ...freshness,
      requiresLiveVerification: false,
    };
  }

  const status = grant.url_status ?? grant.urlStatus ?? "unknown";
  const requiresLiveVerification =
    status === "unknown" &&
    Boolean(grant.applicationUrl?.trim()) &&
    !hasFutureDeadline(grant.deadline, now);

  return {
    ...freshness,
    requiresLiveVerification,
  };
}

async function markGrantUrlStatus(
  supabase: SupabaseUpdateClient | undefined,
  grantId: string | null | undefined,
  result: HealthCheckResult
): Promise<void> {
  if (!supabase || !grantId) return;
  try {
    await supabase
      .from("Grant")
      .update({
        url_status: result.status,
        url_checked_at: new Date().toISOString(),
      })
      .eq("id", grantId);
  } catch (error) {
    console.warn("[grant-actionability] failed to persist URL status", error);
  }
}

export async function verifyGrantActionable(
  grant: GrantActionabilityInput,
  options?: {
    supabase?: SupabaseUpdateClient;
    check?: LiveCheck;
    now?: Date;
  }
): Promise<GrantActionabilityStatus> {
  const base = getGrantActionabilityStatus(grant, options?.now);
  if (!base.usable || !base.requiresLiveVerification) return base;

  const applicationUrl = grant.applicationUrl?.trim();
  if (!applicationUrl) return base;

  const check = options?.check ?? checkUrlHealth;
  const result = await check(applicationUrl, grant);
  if (result.status === "dead" || result.status === "expired") {
    await markGrantUrlStatus(options?.supabase, grant.id, result);
    const status = getGrantFreshnessStatus({
      ...grant,
      url_status: result.status,
    }, options?.now);
    return {
      ...status,
      requiresLiveVerification: false,
      message: status.message ?? result.reason,
    };
  }

  if (result.status === "live") {
    await markGrantUrlStatus(options?.supabase, grant.id, result);
  }

  return {
    ...base,
    requiresLiveVerification: false,
  };
}

export function isGrantActionableNow(grant: GrantActionabilityInput, now = new Date()): boolean {
  return getGrantActionabilityStatus(grant, now).usable;
}
