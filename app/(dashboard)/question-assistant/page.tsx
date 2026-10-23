import { createHash } from "crypto";
import { getActiveOrg } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { planAllowsForOrg } from "@/lib/plan-features";
import { QuestionAssistant } from "@/components/grants/question-assistant";

export default async function QuestionAssistantPage({ searchParams }: { searchParams: Promise<{ grantId?: string }> }) {
  const { org, orgId, user, profile } = await getActiveOrg();
  const params = await searchParams;
  if (!profile?.id) return <p className="p-6">Create a business profile to draft grant answers.</p>;
  const allowed = planAllowsForOrg(org, "founder_pack");
  const { count, error } = await getSupabaseAdmin().from("Usage").select("id", { count: "exact", head: true })
    .eq("organisationId", orgId).eq("type", "founder_pack_free_answer");
  return <QuestionAssistant key={profile.id} profileId={profile.id} businessName={profile.businessName ?? "Your business"}
    allowed={allowed} previewAvailable={!error && (count ?? 0) === 0} grantId={params.grantId}
    draftScope={createHash("sha256").update(`${user.id}:${orgId}:${profile.id}`).digest("hex")} />;
}
