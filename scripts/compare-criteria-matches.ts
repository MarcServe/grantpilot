/** Read-only shadow comparison. Supply the exact organisation/profile IDs. */
import { loadProfileMatches } from "../lib/profile-matches";
async function main() {
  const [orgId, profileId] = process.argv.slice(2);
  if (!orgId || !profileId)
    throw new Error(
      "Usage: tsx scripts/compare-criteria-matches.ts ORGANISATION_ID PROFILE_ID",
    );
  process.env.GRANTS_CRITERIA_V1 = "false";
  const before = await loadProfileMatches(orgId, profileId);
  process.env.GRANTS_CRITERIA_V1 = "true";
  const after = await loadProfileMatches(orgId, profileId);
  const previous = Object.fromEntries(
    Object.entries(before.sections).flatMap(([s, rows]) =>
      rows.map((g) => [g.grantId, s]),
    ),
  );
  const rows = Object.entries(after.sections).flatMap(([section, grants]) =>
    grants.map((g) => ({
      grantId: g.grantId,
      before: previous[g.grantId],
      after: section,
      coverage: g.criteriaAssessment?.coverage,
      counts: g.criteriaAssessment?.counts,
    })),
  );
  console.log(
    JSON.stringify(
      {
        before: before.counts,
        after: after.counts,
        version: after.version,
        rows,
      },
      null,
      2,
    ),
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
