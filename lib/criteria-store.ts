import { getSupabaseAdmin } from "@/lib/supabase";
import {
  assessCriteria,
  unavailableCriteria,
  type CriteriaDocument,
  type CriterionAnswer,
} from "@/lib/criteria";
export async function loadCriteria(
  orgId: string,
  profileId: string,
  grantIds: string[],
  db = getSupabaseAdmin(),
) {
  const documents = new Map<string, CriteriaDocument>();
  const answers = new Map<string, Record<string, CriterionAnswer>>();
  for (let i = 0; i < grantIds.length; i += 80) {
    const ids = grantIds.slice(i, i + 80);
    const [d, a] = await Promise.all([
      db
        .from("grant_criteria_documents")
        .select("grant_id,document")
        .in("grant_id", ids),
      db
        .from("grant_criteria_answers")
        .select("grant_id,criterion_id,answer")
        .eq("organisation_id", orgId)
        .eq("profile_id", profileId)
        .in("grant_id", ids),
    ]);
    if (d.error || a.error)
      throw new Error(d.error?.message ?? a.error?.message);
    for (const row of d.data ?? [])
      documents.set(row.grant_id, row.document as CriteriaDocument);
    for (const row of a.data ?? [])
      answers.set(row.grant_id, {
        ...answers.get(row.grant_id),
        [row.criterion_id]: row.answer as CriterionAnswer,
      });
  }
  return {
    documents,
    answers,
    assess: (grantId: string, profile: Record<string, unknown>) =>
      assessCriteria(
        documents.get(grantId) ?? unavailableCriteria(),
        profile,
        answers.get(grantId) ?? {},
      ),
  };
}
