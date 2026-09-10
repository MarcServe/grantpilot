/** Explicit operator tool: dry-run inventory by default; --write extracts and stores sources. */
import { getSupabaseAdmin } from "../lib/supabase";
import { isGrantActionableNow } from "../lib/grant-actionability";
import { extractCriteriaDocument } from "../lib/criteria-source";

async function main() {
  const db = getSupabaseAdmin();
  const write = process.argv.includes("--write");
  const limit = Math.max(
    1,
    Math.min(1000, Number(process.env.CRITERIA_BACKFILL_LIMIT ?? 25)),
  );
  let processed = 0;
  for (let offset = 0; processed < limit; offset += 250) {
    const rows = await db
      .from("Grant")
      .select("*")
      .order("createdAt", { ascending: false })
      .order("id")
      .range(offset, offset + 249);
    if (rows.error) throw new Error(rows.error.message);
    for (const grant of rows.data ?? []) {
      if (!isGrantActionableNow(grant)) continue;
      const existing = await db
        .from("grant_criteria_documents")
        .select("updated_at")
        .eq("grant_id", grant.id)
        .maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (
        existing.data &&
        Date.now() - Date.parse(existing.data.updated_at) < 7 * 86400000
      )
        continue;
      processed++;
      if (!write)
        console.log(
          JSON.stringify({
            grantId: grant.id,
            status: "awaiting_source_review",
          }),
        );
      else {
        try {
          const document = await extractCriteriaDocument(
            grant.detailUrl || grant.applicationUrl,
            grant.name,
          );
          const saved = await db.from("grant_criteria_documents").upsert({
            grant_id: grant.id,
            document,
            updated_at: new Date().toISOString(),
          });
          if (saved.error) throw new Error(saved.error.message);
          console.log(
            JSON.stringify({
              grantId: grant.id,
              coverage: document.coverage,
              criteria: document.criteria.length,
            }),
          );
        } catch (e) {
          console.error(
            JSON.stringify({
              grantId: grant.id,
              status: "incomplete",
              error: e instanceof Error ? e.message : "Extraction failed",
            }),
          );
        }
      }
      if (processed >= limit) break;
    }
    if ((rows.data?.length ?? 0) < 250) break;
  }
  console.log(JSON.stringify({ mode: write ? "write" : "dry-run", processed }));
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
