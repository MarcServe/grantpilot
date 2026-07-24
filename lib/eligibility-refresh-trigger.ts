import { inngest } from "@/inngest/client";

/**
 * Fire-and-forget request to refresh eligibility cache/notifications.
 * Runs asynchronously via Inngest so user actions stay responsive.
 */
export async function requestEligibilityRefresh(
  orgId: string | null | undefined,
  source: string
): Promise<void> {
  try {
    const id = orgId?.trim();
    if (id) {
      await inngest.send({
        name: "eligibility/refresh.requested",
        data: { orgId: id, source },
      });
      return;
    }

    await inngest.send({
      name: "eligibility/refresh.enqueue.requested",
      data: { source, dueOnly: false },
    });
  } catch (e) {
    console.error("[eligibility-refresh-trigger]", source, e);
  }
}

/**
 * Queue a profile-specific first-pass backfill against reusable grant intelligence.
 * This is scoring-only: it does not send email or WhatsApp immediately.
 */
export async function requestProfileEligibilityBackfill(
  orgId: string | null | undefined,
  profileId: string | null | undefined,
  source: string
): Promise<void> {
  try {
    const organisationId = orgId?.trim();
    const id = profileId?.trim();
    if (!organisationId || !id) return;

    await inngest.send({
      name: "eligibility/profile-backfill.requested",
      data: {
        orgId: organisationId,
        profileId: id,
        source,
      },
    });
  } catch (e) {
    console.error("[eligibility-profile-backfill-trigger]", source, e);
  }
}
