# GrantsCopilot 4 rollout

The implementation introduces source-backed criteria and a Verify → Prepare journey. It does not verify Barrie's handwritten funding amounts, equity percentage or geographic query; those remain source-review questions. Winners intelligence, expert services and marketplace payments are outside this release.

## Enable safely

1. Apply `supabase/migrations/065_criteria_verification.sql` to a staging database after the existing migrations. It is additive. Keep legacy assessments. The five new tables enable RLS without client policies; server APIs authenticate the active organisation/profile.
2. Configure the existing Supabase service credentials, OpenAI provider and Inngest infrastructure in staging. Set `GRANTS_CRITERIA_V1=true` on both the web application and Inngest worker. The flag defaults off. The new `criteria-refresh` function is registered through `/api/inngest`.
3. Run `npx tsx scripts/backfill-criteria.ts` for an inventory without extraction or writes. Set `CRITERIA_BACKFILL_LIMIT` to bound work (default 25). Run with `--write` only against the intended database to extract and store active source documents. This consumes model requests. Inaccessible, oversized, PDF and login-only pages remain incomplete; the tool does not invent requirements or values.
4. Run `npx tsx scripts/compare-criteria-matches.ts ORGANISATION_ID PROFILE_ID`. This read-only comparison prints legacy and criteria-enabled counts, criterion coverage and section changes. Review changes with the source. Sources age out after seven days; backfill skips current documents and prioritises recent active listings.
5. Exercise acceptance scenarios below using separate staging profiles. Only then enable the flag in production. Roll back the criteria UI by setting the flag false; keep additive records for inspection. Funding classification protections and common portfolio counts are shared baseline fixes and remain active with the flag off.

## Acceptance checks

- Explicit size limits, dates and numeric comparisons respect saved facts, zero values and OR alternatives. Unknown facts are distinct from failures; failed mandatory criteria cannot be strong.
- A confirmation cannot override a measured failure. Confirmations bind to the source version and the saved profile fact, so changed evidence becomes unresolved.
- Dashboard and My Matches use the same profile-scoped portfolio. All section counts refer to the full result, independently of pages. A browser detects changed portfolio versions instead of combining them silently.
- Research resources, expired listings, applied/dismissed/deferred states do not enter active opportunity counts. Unknown legacy amounts and programme totals do not become applicant maxima. Averages group loaded records by currency, funding type and amount basis and include sample sizes.
- Verify asks unresolved questions, exposes saved facts, stores grant confirmations locally and stores explicitly reusable quick facts in the active business profile. The selected opportunity is assessed first. An active run is reserved before mutations; one run per profile is enforced by the database.
- Refresh state persists across reloads. Worker retries are bounded, failed runs can be retried, and completion reports actual rechecked/strong transitions. Check profile isolation and a profile change during a run. Normal profile forms retain the existing refresh infrastructure; quick facts use the visible criteria refresh workflow.
- Complete/Incomplete profile lists open the relevant step/field. Strong navigation opens five results with View all available.
- Founder Pack receives selected-grant requirements. Its persistent checklist separates drafts from reviewed evidence and invalidates old checks when source versions change. Uploaded documents alone are not treated as fulfilled requirements.

## Observe

Inspect `criteria_refresh_runs` by organisation/profile for queued/running/failed states, progress and result counts. Worker logs use `[criteria-refresh]`. Investigate queued runs that are not picked up by Inngest rather than declaring them completed. Source coverage is stored in `grant_criteria_documents.document.coverage`; extracted timestamp and source hash support audits. `grant_criteria_assessments` preserves assessed snapshots. Run the comparison tool for counts and classification changes. Review verification-to-preparation conversion with target users; this release does not prove improved market fit.

## Known validation boundaries

No production migration, backfill, source extraction or deployment is performed by the implementation task. Local unit/portfolio regression tests and a production build do not replace authenticated staging tests with the real database, source pages and Inngest transport. Current extraction supports public HTTPS HTML/text only; multi-page/PDF source support is future work, with explicit incomplete status meanwhile. Workload bands are heuristics, not measured time savings.
