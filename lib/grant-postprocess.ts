import { inngest } from "@/inngest/client";
import { generateAndStoreGrantEmbedding } from "@/lib/embeddings";
import { getSupabaseAdmin } from "@/lib/supabase";
import { checkUrlHealth, type HealthCheckContext, type UrlStatus } from "@/lib/url-health-check";

export interface GrantPostprocessPayload {
  grantId: string;
  applicationUrl?: string | null;
  context?: HealthCheckContext;
}

export interface GrantPostprocessRequestResult {
  enqueued: boolean;
  eventId?: string;
  error?: string;
}

export interface GrantPostprocessRunResult {
  grantId: string;
  embedding: "stored" | "skipped" | "failed";
  urlHealth: "checked" | "skipped" | "failed";
  urlStatus?: UrlStatus;
  errors: string[];
}

function hourKey(date = new Date()): string {
  return date.toISOString().slice(0, 13);
}

export async function requestGrantPostprocess(
  payload: GrantPostprocessPayload,
  options?: { now?: Date }
): Promise<GrantPostprocessRequestResult> {
  if (!payload.grantId) return { enqueued: false, error: "Missing grantId" };
  const eventId = `grant-postprocess:${payload.grantId}:${hourKey(options?.now)}`;
  try {
    await inngest.send({
      id: eventId,
      name: "grant/postprocess.requested",
      data: payload,
    });
    return { enqueued: true, eventId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[grant-postprocess] failed to enqueue ${payload.grantId}: ${message}`);
    return { enqueued: false, eventId, error: message };
  }
}

async function getGrantHealthContext(grantId: string): Promise<(HealthCheckContext & { applicationUrl?: string | null }) | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("Grant")
    .select("applicationUrl, name, funder, deadline, eligibility, description, objectives")
    .eq("id", grantId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load grant for postprocess: ${error.message}`);
  return data as (HealthCheckContext & { applicationUrl?: string | null }) | null;
}

export async function runGrantPostprocess(payload: GrantPostprocessPayload): Promise<GrantPostprocessRunResult> {
  const errors: string[] = [];
  let embedding: GrantPostprocessRunResult["embedding"] = "skipped";
  let urlHealth: GrantPostprocessRunResult["urlHealth"] = "skipped";
  let urlStatus: UrlStatus | undefined;

  if (!payload.grantId) throw new Error("Missing grantId for grant postprocess");

  try {
    await generateAndStoreGrantEmbedding(payload.grantId);
    embedding = "stored";
  } catch (error) {
    embedding = "failed";
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    const grant = await getGrantHealthContext(payload.grantId);
    const applicationUrl = payload.applicationUrl?.trim() || grant?.applicationUrl?.trim();
    if (applicationUrl) {
      const context = {
        ...(grant ?? {}),
        ...(payload.context ?? {}),
        applicationUrl,
      };
      const result = await checkUrlHealth(applicationUrl, context);
      await getSupabaseAdmin()
        .from("Grant")
        .update({ url_status: result.status, url_checked_at: new Date().toISOString() })
        .eq("id", payload.grantId);
      urlHealth = "checked";
      urlStatus = result.status;
    }
  } catch (error) {
    urlHealth = "failed";
    errors.push(error instanceof Error ? error.message : String(error));
  }

  return {
    grantId: payload.grantId,
    embedding,
    urlHealth,
    urlStatus,
    errors,
  };
}
