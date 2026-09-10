import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadProfileMatches, pageProfileMatches } from "../lib/profile-matches";
import type { CriteriaDocument } from "../lib/criteria";
type Row = Record<string, unknown>;
function memoryDb(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      let from = 0;
      let to = Infinity;
      let one = false;
      const q = {
        select() {
          return q;
        },
        eq(k: string, v: unknown) {
          rows = rows.filter((r) => r[k] === v);
          return q;
        },
        in(k: string, v: unknown[]) {
          rows = rows.filter((r) => v.includes(r[k]));
          return q;
        },
        order(k: string, o?: { ascending?: boolean }) {
          rows.sort(
            (a, b) =>
              String(a[k]).localeCompare(String(b[k])) *
              (o?.ascending === false ? -1 : 1),
          );
          return q;
        },
        range(a: number, b: number) {
          from = a;
          to = b;
          return q;
        },
        limit(n: number) {
          to = n - 1;
          return q;
        },
        single() {
          one = true;
          return q;
        },
        then(resolve: (value: unknown) => unknown) {
          const data = rows.slice(from, to + 1);
          return Promise.resolve(
            resolve({ data: one ? data[0] : data, error: null }),
          );
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
}
async function main() {
  process.env.GRANTS_CRITERIA_V1 = "true";
  const profile = {
    id: "p1",
    organisationId: "org",
    businessName: "Micro Ltd",
    businessType: "Startup",
    employeeCount: 3,
    location: "Bristol, UK",
    sector: "Technology",
    fundingPurposes: ["prototype"],
    description: "Technology prototypes",
  };
  const doc: CriteriaDocument = {
    version: 1,
    sourceVersion: "v1",
    sourceUrl: "https://example.org/award",
    extractedAt: new Date().toISOString(),
    coverage: "complete",
    criteria: [
      {
        id: "size",
        label: "Under ten employees",
        category: "size",
        mandatory: true,
        alternativeGroup: null,
        field: "employeeCount",
        operator: "lt",
        expected: 10,
        excerpt: "Under ten employees",
        question: "How many employees?",
      },
    ],
    objectives: [],
    workload: [],
    terms: [],
  };
  const grants = Array.from({ length: 12 }, (_, i) => ({
    id: `g${i}`,
    name: `Prototype Award ${i}`,
    funder: "Official Funder",
    amount: 999999,
    applicantMaxAmount: 25000,
    eligibility: "UK technology companies developing prototypes",
    description: "Prototype technology",
    objectives: "Prototype technology development",
    sectors: ["Technology"],
    regions: ["UK"],
    deadline: "2099-12-31",
    url_status: "live",
    createdAt: "2026-08-01",
    opportunityType: "grant",
  }));
  grants[9].name = "Funding guide";
  grants[10].deadline = "2000-01-01";
  const tables: Record<string, Row[]> = {
    BusinessProfile: [profile, { ...profile, id: "p2", employeeCount: 500 }],
    Grant: grants,
    EligibilityAssessment: [
      ...grants.map((g) => ({
        grant_id: g.id,
        organisation_id: "org",
        profile_id: "p1",
        score: 90,
        decision: "likely_eligible",
        scoring_source: "openai",
        updated_at: "2026-08-01",
        missing_criteria: [],
      })),
      {
        grant_id: "g11",
        organisation_id: "org",
        profile_id: "p2",
        score: 95,
        scoring_source: "openai",
      },
    ],
    SavedGrant: [
      {
        organisation_id: "org",
        profile_id: "p1",
        grant_id: "g8",
        status: "viewed",
      },
    ],
    Application: [{ organisationId: "org", profileId: "p1", grantId: "g7" }],
    ApplicationOutcome: [],
    grant_criteria_documents: grants.map((g) => ({
      grant_id: g.id,
      document: doc,
    })),
    grant_criteria_answers: [],
  };
  const db = memoryDb(tables);
  const portfolio = await loadProfileMatches("org", "p1", db);
  assert.equal(
    portfolio.counts.suggested,
    8,
    "exclude closed, directory, applied, reviewed from strong counts",
  );
  assert.equal(portfolio.counts.reviewed, 1);
  const first = pageProfileMatches(portfolio, "suggested", 1, 5);
  const second = pageProfileMatches(portfolio, "suggested", 2, 5);
  assert.equal(first.grants.length, 5);
  assert.equal(second.grants.length, 3);
  assert.equal(first.availableCandidateCount, 8);
  assert.equal(first.version, second.version);
  assert.equal(second.hasMore, false);
  const other = await loadProfileMatches("org", "p2", db);
  assert.equal(other.counts.suggested, 0);
  assert.equal(
    other.counts.other,
    1,
    "failed mandatory size stays below strong",
  );
  tables.BusinessProfile.push({ ...profile, id: "empty" });
  const empty = await loadProfileMatches("org", "empty", db);
  assert.equal(
    Object.values(empty.counts).reduce((a, b) => a + b, 0),
    0,
    "never fall back to another profile",
  );
  console.log(
    "Shared portfolio filtering, exact counts, pagination and profile isolation tests passed",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
