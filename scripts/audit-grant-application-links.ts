import { classifyGrantApplicationUrl, isVerifiedApplicationQuality } from "../lib/grant-application-url-quality";
import { enqueueGrantForScoutIfProgrammeUrl } from "../lib/enqueue-scout";
import { getSupabaseAdmin } from "../lib/supabase";

const supabase = getSupabaseAdmin();

async function main() {
  const limit = Number(process.env.GRANT_LINK_AUDIT_LIMIT ?? 2000);
  const { data: grants, error } = await supabase
    .from("Grant")
    .select("id, name, applicationUrl, detailUrl, directApplicationUrl, applicationUrlQuality, url_status")
    .not("url_status", "in", "(dead,expired)")
    .order("createdAt", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  let verified = 0;
  let queued = 0;
  let rejected = 0;
  let manualReview = 0;

  for (const grant of grants ?? []) {
    const url = String(grant.directApplicationUrl ?? grant.detailUrl ?? grant.applicationUrl ?? "").trim();
    if (!url) continue;

    const classification = classifyGrantApplicationUrl(url);
    const isVerified = isVerifiedApplicationQuality(classification.quality);

    await supabase
      .from("Grant")
      .update({
        detailUrl: grant.detailUrl ?? grant.applicationUrl,
        directApplicationUrl: isVerified ? url : null,
        applicationUrlKind: classification.kind,
        applicationUrlQuality: classification.quality,
        applicationUrlConfidence: classification.confidence,
        applicationUrlQualityReason: classification.reason,
        applicationUrlVerifiedAt: isVerified ? new Date().toISOString() : null,
      })
      .eq("id", grant.id);

    if (isVerified) verified++;
    else if (classification.quality === "needs_scout") {
      if (await enqueueGrantForScoutIfProgrammeUrl(grant.id)) queued++;
    } else if (classification.quality === "rejected") {
      rejected++;
    } else {
      manualReview++;
    }
  }

  console.log({ scanned: grants?.length ?? 0, verified, queued, rejected, manualReview });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
