# Grant sourcing evidence audit — 18 November 2026

## Verified repository findings

The built-in registry contains 186 rows, 186 distinct normalized endpoints and 176 distinct domains (www aliases combined). No duplicate endpoints or invalid URL rows were found using the registry's existing endpoint-key convention. The entries are classified as 160 government_portal and 26 foundation rows. These types are registry labels, not an independent source certification. The registry contains local/regional, UK-wide, EU and global-labelled entries. These counts are reproducible with scripts/test-source-coverage.ts and are calculated directly for the public sourcing section, so future seed changes update the displayed foundation count.

The code supports registry adapters, direct feed imports and AI-assisted discovery. Provider configuration is not proof of successful provider calls. The reported Apify 401 needs a valid runtime key and a later successful run before Apify performance can be claimed.

Before this change, vercel.json scheduled source enqueue daily at 05:00 UTC. Its default batch is 20 claims and inline processing is capped at 3 by default (maximum 5). Before this change, inngest/grant-source-crawler.ts also scheduled enqueue every six hours and provides a source-run event worker. Source intervals include 6, 24, 72 and 168 hours. The deployment/worker connection and environment values must be verified to establish actual throughput. Neither scheduling code nor seeded source count demonstrates that all source pages are successfully crawled daily.

## Public positioning implemented

The homepage now explains the multi-source discovery infrastructure, Business DNA relevance and ongoing monitoring. It exposes exact built-in page/domain counts, named source examples and their meaning. It does not assert the largest database, unique independent funder count, exhaustive coverage, percentage recall, guaranteed eligibility, active-provider count or successful daily checks. No production database scan was added to the public homepage. Existing grant workflows, matching, notifications, billing and loan paths are unchanged.

## Live evidence available to administrators

Admin → Sourcing coverage evidence → Run live coverage audit performs a read-only, bounded scan of grant_sources (at most 5,000 rows). It reports distinct/enabled pages, domains, latest successful or non-successful outcomes within seven days, never-attempted rows, missing outcomes, duplicate/invalid rows and due rows. Partial scans are labelled. Source outcome columns must be available; errors do not become zero-success or healthy claims. Only admins can request the no-store endpoint; source endpoints and raw operational errors are not returned publicly. The panel loads on demand, not during homepage or admin-page entry.

Success/non-success measures count rows by their latest outcome, not historical runs or independent funders. A successful source check may discover no grant. A failed latest attempt may hide an earlier success. Counts can change during a paginated read; this is an operational snapshot, not a transactionally locked ledger.

## Findings still requiring production evidence

No authenticated production registry was queried for this audit. The live enabled registry may contain additional imported sources and must not be equated with the 186 built-in entries. Confirm live outcomes with the new admin audit, then inspect cron and worker runs for failures or throughput gaps. Do not publish active coverage metrics until verified.

A defensible comparison with ordinary searches also needs a benchmark set: select representative sectors/locations, have an adviser identify relevant open opportunities independently, record which were found/missed, distinguish duplicates and expired listings, and retain original source/date evidence. This release does not invent recall percentages or claim those benchmark results. Unusual-provider examples should be chosen from verified current opportunities, not inferred from seed names.

## Verification

Pure coverage tests cover normalized duplicates, disabled rows, invalid endpoints, future timestamps and the configuration-versus-success distinction. TypeScript, targeted lint and production build are run for the change. Live database/cron verification remains a deployment check. No schema migration is required.

## Public-page availability sample

A direct read using the app's existing public-source reader fetched HTML from UKRI Funding Finder, Innovate UK Competition Search, Find a Grant and Scottish Enterprise (which redirected to its current funding URL). The Business Wales seed failed through this reader. This is a five-page availability sample, not proof that live crawlers ran or that returned pages contained usable open grants. The failed read does not establish that Business Wales is down; the reader error did not distinguish a blocked response from unsupported content. It should be investigated in the live source outcomes before advertising successful monitoring of that entry.

## Throughput changes following the daily-coverage review

Vercel source enqueue now runs hourly at minute 0, and Inngest source enqueue runs hourly at minute 30. Both default to 50 claimed sources per run, configurable with GRANT_SOURCE_CRON_LIMIT and capped at 100. Source event workers have a global cap of four (configurable downward with GRANT_SOURCE_WORKER_CONCURRENCY) and one worker per sourceDomain. Enqueued events include their domain. Atomic claims from migration 059 continue preventing concurrent scheduler claims. Existing cadence and bounded inline fallbacks are preserved. At 50 claims per hourly scheduler, theoretical daily enqueue capacity is 1,200 per scheduler; this is not proven processing capacity and requires healthy Inngest delivery, credentials, source availability and runtime budget. Explicit lower deployment overrides remain effective.

This change does not force 72-hour/weekly entries to run daily. It does not raise the separate discovery-URL queue processor limits: that queue lacks atomic per-URL claims, so increasing overlapping processing without a claim design risks duplicate work. Its Vercel default is 20 URLs/day and Inngest default is 30 every 12 hours when enabled. It currently rejects PDF grant discovery, and the HTML reader does not render JavaScript. These are additional reasons source breadth does not translate directly into new grant counts.

Source crawling currently handles one configured page per source, with content-hash change detection and classifier/AI extraction. It does not imply full-site traversal. Grant ingestion checks existing IDs, URLs and name/funder candidates; repeated opportunities are generally upserts, not new grants. Failed/rejected individual saves were logged but not separately counted in source outcomes; new runs now persist skipped counts. The coverage audit shows new, existing-upsert and skipped counts from latest successful source records, explicitly not daily totals. Claims are shown separately from failures. No daily yield target is inferred from registry size. A production investigation must distinguish duplicate candidates from duplicate saved grant rows and inspect the candidate queue, source outcomes and provider failures.
