import assert from "node:assert/strict";
import { sourceCoverage } from "../lib/source-coverage";
import { DEFAULT_UK_EU_GLOBAL_GRANT_SOURCE_SEEDS } from "../lib/default-grant-source-seeds";
const now=Date.parse("2026-11-18T12:00:00Z");
const rows=[
 {endpoint:"https://funder.example/grants",enabled:true,last_crawled_at:"2026-11-18T10:00:00Z",last_crawl_status:"success",crawl_frequency:"6h"},
 {endpoint:"https://funder.example/grants/",enabled:false,last_crawled_at:"2026-11-18T10:00:00Z",last_crawl_status:"success"},
 {endpoint:"https://other.example",enabled:true,last_crawled_at:"2026-11-17T00:00:00Z",last_crawl_status:"blocked",crawl_frequency:"24h"},
 {endpoint:"https://new.example",enabled:true,last_crawled_at:null,last_crawl_status:null},
 {endpoint:"not a URL",enabled:true},
 {endpoint:"https://future.example",enabled:true,last_crawled_at:"2026-11-19T10:00:00Z",last_crawl_status:"success"},
];
const before=JSON.stringify(rows);const s=sourceCoverage(rows,now);
assert.equal(s.distinctPages,4);assert.equal(s.duplicateRows,1);assert.equal(s.invalidRows,1);assert.equal(s.enabledPages,4);assert.equal(s.latestSuccessWithin7Days,1);assert.equal(s.latestFailureWithin7Days,1);assert.equal(s.neverAttempted,1);assert.equal(s.overdue,2);assert.equal(JSON.stringify(rows),before);
const registry=sourceCoverage(DEFAULT_UK_EU_GLOBAL_GRANT_SOURCE_SEEDS,now);assert.ok(registry.distinctPages>=100);assert.equal(registry.enabledRows,0);assert.equal(registry.latestSuccessWithin7Days,0);assert.ok(registry.distinctDomains<=registry.distinctPages);
console.log(JSON.stringify({builtInRegistry:registry,checks:"Distinct pages/domains, duplicate rows, disabled rows, unknown/future outcomes and configuration-versus-success boundaries passed"},null,2));

const claimed=sourceCoverage([{endpoint:"https://queued.example",enabled:true,last_crawled_at:"2026-11-18T10:00:00Z",last_crawl_status:"claimed"}],now);assert.equal(claimed.latestFailureWithin7Days,0);assert.equal(claimed.claimedRows,1);
const yields=sourceCoverage([{endpoint:"https://yields.example",enabled:true,last_crawled_at:"2026-11-18T10:00:00Z",last_crawl_status:"success",last_crawl_result:{created:3,updated:12,skipped:2}},{endpoint:"https://disabled.example",enabled:false,last_crawled_at:"2026-11-18T10:00:00Z",last_crawl_status:"success",last_crawl_result:{created:99}}],now);assert.equal(yields.latestRecordedNew7Days,3);assert.equal(yields.latestRecordedUpserts7Days,12);assert.equal(yields.latestRecordedSkipped7Days,2);
