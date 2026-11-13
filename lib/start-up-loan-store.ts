import type { getSupabaseAdmin } from "@/lib/supabase";
import { loanIntakeSchema, loanIntakeContext } from "@/lib/start-up-loan-readiness";
export async function loadLoanIntakeContext(db: ReturnType<typeof getSupabaseAdmin>, orgId: string, profileId: string, applicantId: string | undefined) {
  if (!applicantId) return "";
  const result = await db.from("StartUpLoanIntake").select("answers").eq("organisationId", orgId).eq("profileId", profileId).eq("applicantId", applicantId).maybeSingle();
  if (result.error) {
    if (["42P01", "PGRST205", "PGRST204"].includes(result.error.code)) return "";
    throw new Error("Saved loan intake could not be loaded. Please retry.");
  }
  if (!result.data) return "";
  const parsed = loanIntakeSchema.safeParse(result.data.answers);
  if (!parsed.success) throw new Error("Please review and save the loan intake again before drafting.");
  return loanIntakeContext(parsed.data);
}
