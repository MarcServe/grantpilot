import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const adminPage = readFileSync("app/admin/page.tsx", "utf8");

assert.match(
  adminPage,
  /const UPSTREAM_CRAWLER_ROUTES = \[/,
  "admin should define the crawler/source routes used for upstream health"
);
assert.match(
  adminPage,
  /ADMIN_GRANT_SOURCE_STATUS_LIMIT = 1000/,
  "admin should sample enough grant_sources rows to catch local registry coverage problems"
);
assert.match(
  adminPage,
  /function buildUpstreamCrawlerHealth/,
  "admin should aggregate daily upstream crawler health"
);
assert.match(
  adminPage,
  /Local never crawled/,
  "crawler health should show local or regional sources that have never run"
);
assert.match(
  adminPage,
  /Sources processed/,
  "crawler health should show whether workers actually processed enqueued sources"
);
assert.match(
  adminPage,
  /Daily upstream intake checklist/,
  "admin should expose a daily upstream intake checklist"
);
assert.match(
  adminPage,
  /Grant source claim\/outcome columns are not readable/,
  "admin should warn when source claiming diagnostics cannot read the migration-backed columns"
);

console.log("Admin upstream health checks passed");
