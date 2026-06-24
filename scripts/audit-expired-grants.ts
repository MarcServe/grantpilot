import { getGrantFreshnessStatus } from "../lib/grant-freshness";
import { getSupabaseAdmin } from "../lib/supabase";
import { checkUrlHealth } from "../lib/url-health-check";

const supabase = getSupabaseAdmin();

async function main() {
  const limit = Number(process.env.GRANT_AUDIT_LIMIT ?? 1000);
  const { data: grants, error } = await supabase
    .from("Grant")
    .select("id,name,funder,deadline,applicationUrl,eligibility,description,objectives,url_status")
    .not("applicationUrl", "is", null)
    .not("url_status", "in", "(dead,expired)")
    .order("createdAt", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  let expired = 0;
  let dead = 0;
  let checked = 0;

  for (const grant of grants ?? []) {
    const storedFreshness = getGrantFreshnessStatus(grant);
    const result = storedFreshness.usable
      ? await checkUrlHealth(String(grant.applicationUrl), grant)
      : {
          status: "expired" as const,
          reason: storedFreshness.message ?? "Stored grant deadline is stale",
        };

    checked++;
    if (result.status !== "expired" && result.status !== "dead") continue;

    await supabase
      .from("Grant")
      .update({
        url_status: result.status,
        url_checked_at: new Date().toISOString(),
      })
      .eq("id", grant.id);

    if (result.status === "expired") expired++;
    if (result.status === "dead") dead++;
  }

  console.log({ checked, expired, dead });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
