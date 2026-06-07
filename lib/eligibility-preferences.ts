import { getSupabaseAdmin } from "@/lib/supabase";

const DEFAULT_ELIGIBILITY_MIN_SCORE = 85;
const DEFAULT_ELIGIBILITY_MAX_SCORE = 100;
const DEFAULT_ELIGIBLE_THRESHOLD = 85;

export async function syncEligibilityWhatsAppPreference(
  organisationId: string,
  notifyWhatsApp: boolean
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: existing, error: readError } = await supabase
    .from("EligibilityNotificationPreference")
    .select("id")
    .eq("organisation_id", organisationId)
    .maybeSingle();

  if (readError) throw new Error(readError.message);

  if (existing) {
    const { error } = await supabase
      .from("EligibilityNotificationPreference")
      .update({ notify_whatsapp: notifyWhatsApp, updated_at: now })
      .eq("organisation_id", organisationId);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase
    .from("EligibilityNotificationPreference")
    .insert({
      organisation_id: organisationId,
      min_score: DEFAULT_ELIGIBILITY_MIN_SCORE,
      max_score: DEFAULT_ELIGIBILITY_MAX_SCORE,
      eligible_threshold: DEFAULT_ELIGIBLE_THRESHOLD,
      notify_email: true,
      notify_in_app: true,
      notify_whatsapp: notifyWhatsApp,
      updated_at: now,
    });

  if (error) throw new Error(error.message);
}

