-- Track whether a cached eligibility score came from full OpenAI reasoning or a low-cost pre-filter.
ALTER TABLE "EligibilityAssessment"
  ADD COLUMN IF NOT EXISTS "scoring_source" TEXT NOT NULL DEFAULT 'openai';

ALTER TABLE "EligibilityAssessment"
  ADD CONSTRAINT eligibility_assessment_scoring_source_check
  CHECK ("scoring_source" IN ('openai', 'heuristic', 'embedding', 'manual'));

COMMENT ON COLUMN "EligibilityAssessment"."scoring_source" IS
  'Source of cached score: openai = full company-DNA reasoning, heuristic = preliminary low-cost fit, embedding = similarity rank, manual = admin/imported.';

UPDATE "EligibilityAssessment"
SET
  "scoring_source" = 'heuristic',
  "score" = LEAST("score", 69),
  "decision" = CASE
    WHEN LEAST("score", 69) >= 70 THEN 'likely_eligible'
    WHEN LEAST("score", 69) >= 40 THEN 'review'
    ELSE 'unlikely'
  END,
  "summary" = regexp_replace(COALESCE("summary", ''), '^Heuristic match:', 'Preliminary fit only:')
WHERE COALESCE("summary", '') ILIKE 'Heuristic match:%';
