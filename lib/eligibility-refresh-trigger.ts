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
