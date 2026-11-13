# Application priority advisory layer

This layer produces **Prioritise now**, **Prepare first**, or **Seek clarification** alongside the existing eligibility result. It is deterministic, rules-based advice with attributed outcome/expert context. It is not model retraining, a validated win-probability estimate, or an expert sign-off of the generated recommendation.

## Basis

Current published-source coverage, mandatory checks, trusted scoring source and assessment freshness establish the category. Missing guidance, failed conditions, an unsupported assessment or an existing application require clarification. Missing mandatory information means prepare first. A trusted strong-fit assessment with complete source coverage and no current mandatory gaps can be prioritised.

Up to 30 recent outcomes for the same organisation and business profile are examined. Feedback is relevant if it concerns the same grant, the same named funder, or a requirement theme present in the candidate's published criteria/workload. Supported themes are technical evidence, innovation/defensibility, financial readiness and delivery. Text matching identifies possible relevance, not a confirmed causal explanation. Applicant interpretations and self-reported positive outcomes remain labelled as such. Ticking an improvement action does not verify current evidence or close a published condition.

Up to 10 completed expert reports for that business are considered; reports from the same grant or named funder are linked and attributed to the adviser and administrator. A same-funder report still requires checking applicability. Raw expert prose is not automatically converted into a new eligibility rule or an approval prediction.

## Ordering

Loaded cards within each existing eligibility tier are ordered by priority category, then the count of relevant applicant-recorded positive outcomes. The existing order breaks ties. This is a transparent heuristic, not statistical calibration. The Best Next section includes only prioritise-now cards from loaded opportunities; the dashboard preview also uses the advisory ordering.

Server batch cursor order, eligibility tiers, numeric scores and eligibility decisions are untouched by the priority function. The layer never writes to EligibilityAssessment. Grant details show the reasoning and supporting records. An existing application points back to its outcome/status instead of encouraging another application automatically.

## Data and refresh

There is no new table or migration. Existing outcome records and optional expert reviews are used. If expert migration 070 is not applied, the advice reports limited coverage. Criteria migration 065/source review is required for complete published guidance; without it the priority is seek clarification.

Profile cache revisions include outcome and published-expert update timestamps. Saving outcomes or expert reports also invalidates the match caches and dashboard/eligible routes. Source-review saves already invalidate matching caches. No personal Start Up Loan budget or visa intake is read by this grant-priority layer.

## Checks

`npm run test:application-priority` covers input immutability, unrelated rejections, current resolved evidence, checklist non-verification, provenance, limited coverage, positive tie-breaks, existing applications and scoped/bounded reads. Eligibility-guard, tier and batch-cursor regressions are run separately. Browser checks exercise all three labels, a fixed displayed eligibility score, disclosure links and mobile width. Live authenticated data remains a post-deployment check.
