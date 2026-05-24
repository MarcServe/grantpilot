import { getSupabaseAdmin } from "@/lib/supabase";

type CronRunStatus = "success" | "failed";

interface CronRunDetails {
  jobName: string;
  route: string;
  trigger?: "vercel" | "inngest" | "manual";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeJson(value: unknown): unknown {
  if (value == null) return null;
  try {
    const json = JSON.stringify(value);
    if (json.length > 6000) {
      return {
        truncated: true,
        preview: json.slice(0, 6000),
      };
    }
    return JSON.parse(json) as unknown;
  } catch {
    return {
      unserializable: true,
      preview: String(value).slice(0, 1000),
    };
  }
}

async function recordCronRun(
  details: CronRunDetails,
  status: CronRunStatus,
  startedAt: Date,
  resultOrError: unknown
): Promise<void> {
  const finishedAt = new Date();
  const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
  try {
    await getSupabaseAdmin().from("CronRunLog").insert({
      job_name: details.jobName,
      route: details.route,
      trigger: details.trigger ?? "vercel",
      status,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: durationMs,
      result: status === "success" ? safeJson(resultOrError) : null,
      error: status === "failed" ? errorMessage(resultOrError).slice(0, 2000) : null,
    });
  } catch (logError) {
    console.warn("[cron-run-log] Failed to write cron run log", logError);
  }
}

export async function runWithCronLog<T>(
  details: CronRunDetails,
  operation: () => Promise<T>
): Promise<T> {
  const startedAt = new Date();
  try {
    const result = await operation();
    await recordCronRun(details, "success", startedAt, result);
    return result;
  } catch (error) {
    await recordCronRun(details, "failed", startedAt, error);
    throw error;
  }
}
