import assert from "node:assert/strict";
import {
  getGrantDataQualityIssue,
  grantIdentityKey,
  isListingPageTitle,
  isSameGrantIdentity,
  isTitleYearPassed,
  latestYearInTitle,
} from "../lib/grant-data-quality";
import {
  buildIfsCompetitionIndex,
  matchIfsCompetitionByTitle,
  parseIfsCompetitionSearchHtml,
  parseIfsCompetitionUrl,
  reconcileIfsCompetitionUrls,
} from "../lib/ifs-competitions";
import { classifyGrantApplicationUrl, isGrantAggregatorUrl } from "../lib/grant-application-url-quality";
import { isIdentifyingGrantUrl } from "../lib/grants-ingest";
import { isGrantActionableNow } from "../lib/grant-actionability";
import { buildGrantCleanupPlan, type CleanupGrantRow } from "../lib/grant-cleanup-plan";

const now = new Date("2026-11-27T12:00:00Z");
const IFS = "https://apply-for-innovation-funding.service.gov.uk";

// --- IFS competition index (fixture mirrors the live search page markup) ---
const html = `
<li><a class="govuk-link" href="/competition/2599/overview/1931f35c-87fe-4b6a-a718-a61a2d00e86a">BridgeAI Deployment Catalyst: AI for Operational Systems</a>
<p>Opened:</p><p>21 October 2026</p><p>Closes:</p><p>8 December 2026</p></li>
<li><a class="govuk-link" href="/competition/2598/overview/cfb35198-55fc-4aad-afa1-86a260bfaddf">BridgeAI Deployment Catalyst: AI for Decision Critical Systems</a>
<p>Closes:</p><p>8 December 2026</p></li>
<li><a class="govuk-link" href="/competition/2597/overview/7ec02a95-73e5-4928-8104-67a9f1b279e3">BridgeAI Deployment Catalyst: AI for Assurance and Compliance</a>
<p>Closes:</p><p>8 December 2026</p></li>`;
const comps = parseIfsCompetitionSearchHtml(html);
assert.equal(comps.length, 3);
assert.equal(comps[0].closes, "2026-12-08");
const index = buildIfsCompetitionIndex(comps);
assert.deepEqual(parseIfsCompetitionUrl(`${IFS}/competition/2585/overview/9fdb47a5-011c-4c47-ac5e-c426e295fe89`), { id: "2585", uuid: "9fdb47a5-011c-4c47-ac5e-c426e295fe89" });
assert.equal(matchIfsCompetitionByTitle("BridgeAI Deployment Catalyst: AI for Decision-Critical Systems", index)?.id, "2598");
assert.equal(matchIfsCompetitionByTitle("BridgeAI Deployment Catalyst Phase 1", index), null, "ambiguous programme title must not pick a strand");

// Wrong competition id (403 on IFS) is replaced by the listed competition for that title.
const wrongId = reconcileIfsCompetitionUrls({
  name: "BridgeAI Deployment Catalyst: AI for Assurance and Compliance", funder: "Innovate UK", deadline: "2026-12-08",
  applicationUrl: `${IFS}/competition/2585/overview/9fdb47a5-011c-4c47-ac5e-c426e295fe89`,
  detailUrl: `${IFS}/competition/2585/overview/9fdb47a5-011c-4c47-ac5e-c426e295fe89`,
}, index);
assert.equal(wrongId.grant.applicationUrl, comps[2].url);
assert.equal(wrongId.grant.detailUrl, comps[2].url);
// Listed id but the title belongs to another strand: follow the title.
const swapped = reconcileIfsCompetitionUrls({ name: "BridgeAI Deployment Catalyst: AI for Operational Systems", funder: "Innovate UK", applicationUrl: comps[2].url }, index);
assert.equal(swapped.grant.applicationUrl, comps[0].url);
// Correct link kept; IFS search page upgraded; deadline filled from IFS.
assert.equal(reconcileIfsCompetitionUrls({ name: "Anything", deadline: "2026-12-08", applicationUrl: comps[1].url }, index).changes.length, 0);
const fromSearch = reconcileIfsCompetitionUrls({ name: "BridgeAI Deployment Catalyst: AI for Operational Systems", funder: "Innovate UK", applicationUrl: `${IFS}/competition/search/` }, index);
assert.equal(fromSearch.grant.applicationUrl, comps[0].url);
assert.equal(fromSearch.grant.deadline, "2026-12-08");
// Unlisted competition with no matching title: the fake link is removed, aggregator link remains.
const unlisted = reconcileIfsCompetitionUrls({ name: "Some Other Competition", funder: "Innovate UK", applicationUrl: `${IFS}/competition/1715/overview/ad93e28e-0ef0-4c47-ac5e-c426e295fe89`, detailUrl: "https://govowed.uk/business-grants" }, index);
assert.equal(unlisted.grant.applicationUrl, "https://govowed.uk/business-grants");
// Aggregator-only Innovate UK record gains the official competition page.
const viaAggregator = reconcileIfsCompetitionUrls({ name: "BridgeAI Deployment Catalyst: AI for Decision Critical Systems", funder: "Innovate UK", applicationUrl: "https://www.zengrants.co/signup" }, index);
assert.equal(viaAggregator.grant.detailUrl, comps[1].url);

// IFS URL classification: only specific competitions are a verified portal.
assert.equal(classifyGrantApplicationUrl(comps[0].url).quality, "verified_portal");
assert.equal(classifyGrantApplicationUrl(`${IFS}/competition/search/`).kind, "generic_listing");

// --- Duplicate identity ---
assert.equal(grantIdentityKey({ name: "Innovate UK Smart Grants", funder: "Innovate UK" }), "smart grant");
assert.equal(grantIdentityKey({ name: "Smart Grants (UK)", funder: "Innovate UK" }), "smart grant");
assert.equal(grantIdentityKey({ name: "Innovate UK Smart Grant", funder: "Innovate UK (UKRI)" }), "smart grant");
assert.ok(isSameGrantIdentity(
  { name: "Powering Local Businesses Business Resilience Grant", funder: "EDF Energy", deadline: "2026-11-29" },
  { name: "Powering Local Businesses: Business Resilience Grant", funder: "Enterprise Nation and EDF", deadline: null },
));
assert.ok(!isSameGrantIdentity(
  { name: "BridgeAI Deployment Catalyst: AI for Operational Systems", funder: "Innovate UK" },
  { name: "BridgeAI Deployment Catalyst: AI for Assurance and Compliance", funder: "Innovate UK" },
), "separate competition strands are not duplicates");
assert.ok(!isSameGrantIdentity({ name: "Smart Grants", funder: "Innovate UK", deadline: "2026-07-17" }, { name: "Smart Grants", funder: "Innovate UK", deadline: "2026-10-15" }), "different rounds stay separate");

assert.ok(!isSameGrantIdentity({ name: "Bristol City Council Innovation Fund", funder: "Bristol City Council" }, { name: "Innovation Fund", funder: "West of England Combined Authority" }), "generic names never merge");
assert.ok(!isSameGrantIdentity({ name: "Grant from link", funder: "Unknown" }, { name: "Grant from link", funder: "Unknown" }), "placeholder names never merge");
assert.ok(!isSameGrantIdentity({ name: "Digital Catalyst Award", funder: "Acme Foundation" }, { name: "Digital Catalyst Award", funder: "Other Council" }), "different funders stay separate");
assert.ok(isSameGrantIdentity({ name: "Innovate UK Smart Grants", funder: "Innovate UK" }, { name: "Smart Grants", funder: "UK Research and Innovation" }), "Innovate UK and UKRI are one funder");

// Generic URLs never identify a grant (they hijacked unrelated rows before).
for (const url of [`${IFS}/competition/search/`, "https://www.gov.uk/", "https://www.ukri.org/apply-for-funding/", "https://www.grantgator.org/"]) {
  assert.equal(isIdentifyingGrantUrl(url), false, url);
}
assert.equal(isIdentifyingGrantUrl(comps[0].url), true);

// --- Listing pages ---
for (const name of ["UK business grants calendar", "UK AI startup funding 2026 listing", "AI Grants UK for Small Businesses",
  "UK Government Startup Funding Programs 2026 list including Innovate UK", "UK & Ireland Startup Accelerator Directory entry: Techstars",
  "Current Grant Opportunities – Innovate UK Smart Grants (General)"]) {
  assert.ok(isListingPageTitle(name), name);
}
for (const name of ["Innovate UK Smart Grants", "Powering Local Businesses Business Resilience Grant", "Calendar Year 2022 Disaster Water Grants",
  "BridgeAI Deployment Catalyst: AI for Operational Systems", "Bristol Tech Fund", "Start Up Loans", "Arts Council National Lottery Project Grants"]) {
  assert.ok(!isListingPageTitle(name), name);
}

// --- Year-stale titles ---
assert.equal(latestYearInTitle("Funding 2025/26"), 2026);
assert.equal(latestYearInTitle("Funding 2025-26"), 2026);
for (const name of ["Techstars London Accelerator Fall 2023", "Intel Ignite London Cohort 2023", "EIT Manufacturing's Accelerate Call 2023", "Transport Research and Innovation Grants 2023"]) {
  assert.ok(isTitleYearPassed({ name, deadline: null }, now), name);
  assert.ok(isTitleYearPassed({ name, deadline: "2026-12-31" }, now), `${name} with an invented future deadline`);
}
assert.ok(!isTitleYearPassed({ name: "Innovate UK Smart Grants 2026", deadline: null }, now));
assert.ok(!isTitleYearPassed({ name: "Growth Fund 2025 round", deadline: "2027-01-15" }, now), "last year's round with a future deadline");
assert.ok(!isTitleYearPassed({ name: "Net Zero 2050 Fund", deadline: null }, now));

// --- Aggregator-only and source-unverified ---
assert.equal(getGrantDataQualityIssue({ name: "Innovate UK Smart Grant", applicationUrl: "https://www.grantgator.org/", detailUrl: "https://www.grantgator.org/", source: "openai" }, now)?.code, "aggregator_only");
assert.equal(getGrantDataQualityIssue({ name: "Bristol Tech Fund", source: "claude", applicationUrl: "https://www.bristol.gov.uk/business/business-support-and-advice", detailUrl: "https://www.bristol.gov.uk/business/business-support-and-advice" }, now)?.code, "source_unverified");
assert.equal(getGrantDataQualityIssue({ name: "Bristol Tech Fund", source: "claude", deadline: "2027-01-31", applicationUrl: "https://www.bristol.gov.uk/business/tech-fund/apply" }, now), null);
assert.equal(getGrantDataQualityIssue({ name: "Feed grant", source: "default", applicationUrl: "https://www.gov.uk/" }, now), null, "feed sources are not judged as AI discoveries");
assert.ok(isGrantAggregatorUrl("https://www.startupmag.co.uk/startup-funding/"));
assert.ok(isGrantAggregatorUrl("https://qubit.capital/blog/uk-government-startup-funding-programs-grants"));

// --- Matching gate ---
assert.equal(isGrantActionableNow({ name: "Techstars London Accelerator Fall 2023", applicationUrl: "https://apply.techstars.com/", url_status: "live" }, now), false);
assert.equal(isGrantActionableNow({ name: "UK business grants calendar", applicationUrl: "https://swoopfunding.com/uk/business-grants/calendar/", deadline: "2026-12-31" }, now), false);
assert.equal(isGrantActionableNow({ name: "BridgeAI Deployment Catalyst: AI for Operational Systems", applicationUrl: comps[0].url, deadline: "2026-12-08" }, now), true);

// --- Cleanup planner: only single-row link/status updates, never deletes ---
const row = (o: Partial<CleanupGrantRow> & { id: string; name: string }): CleanupGrantRow => ({
  funder: "Innovate UK", deadline: null, applicationUrl: "", detailUrl: null, directApplicationUrl: null,
  applicationUrlQuality: null, source: "openai", url_status: "unknown", createdAt: "2026-01-01", ...o,
});
const plan = buildGrantCleanupPlan([
  row({ id: "fix", name: "BridgeAI Deployment Catalyst: AI for Assurance and Compliance", deadline: "2026-12-08", applicationUrl: `${IFS}/competition/2585/overview/9fdb47a5-011c-4c47-ac5e-c426e295fe89` }),
  row({ id: "keep", name: "Powering Local Businesses Business Resilience Grant", funder: "EDF Energy", deadline: "2026-11-29", applicationUrl: "https://www.edfenergy.com/energywise/small-business-resilience", source: "perplexity", createdAt: "2026-10-01" }),
  row({ id: "dup", name: "Powering Local Businesses: Business Resilience Grant", funder: "Enterprise Nation and EDF", deadline: "2026-11-29", applicationUrl: "https://acvo.org.uk/funds/the-powering-local-businesses-business-resilience-grant", source: "perplexity", createdAt: "2026-11-11" }),
  row({ id: "smart", name: "Innovate UK Smart Grants", applicationUrl: "https://www.gov.uk/government/collections/innovate-uk-smart-grants" }),
  row({ id: "stale", name: "Techstars London Accelerator Fall 2023", funder: "Techstars", applicationUrl: "https://apply.techstars.com/" }),
  row({ id: "gone", name: "Old", funder: "X", applicationUrl: "https://x.example/a", url_status: "expired" }),
], index, now);
const byId = new Map(plan.actions.map((a) => [a.id, a]));
assert.equal(byId.get("fix")?.action, "fix_ifs_links");
assert.equal(byId.get("fix")?.after.applicationUrl, comps[2].url);
assert.equal(byId.get("fix")?.before.applicationUrl, `${IFS}/competition/2585/overview/9fdb47a5-011c-4c47-ac5e-c426e295fe89`, "before snapshot kept for rollback");
assert.equal(byId.get("keep"), undefined, "strongest duplicate is untouched");
assert.equal(byId.get("dup")?.reason, "duplicate");
assert.deepEqual(byId.get("dup")?.after, { url_status: "expired" });
assert.equal(byId.get("smart")?.reason, "ifs_not_listed");
assert.equal(byId.get("stale")?.reason, "title_year_passed");
assert.equal(byId.get("gone"), undefined, "already-hidden rows are out of scope");

console.log("IFS competition reconciliation, duplicate identity, listing-page, stale-year, aggregator, unverified-source rules and cleanup planner passed");
