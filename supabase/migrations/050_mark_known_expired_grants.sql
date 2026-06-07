-- Preserve known archived grants for auditability, but remove them from
-- actionable matching, notifications, and application start flows.

UPDATE "Grant"
SET
  "url_status" = 'expired',
  "url_checked_at" = now(),
  "updatedAt" = now()
WHERE
  lower("name") = lower('Inclusive Technology Prize')
  OR "applicationUrl" ILIKE '%disability-grants.org/inclusive-technology-prize%';

UPDATE "EligibilityAssessment"
SET
  "score" = 0,
  "decision" = 'unlikely',
  "summary" = 'This opportunity is archived and no longer actionable. The original application deadline was in January 2015.',
  "notified_at" = now(),
  "updated_at" = now()
WHERE "grant_id" IN (
  SELECT "id"
  FROM "Grant"
  WHERE
    lower("name") = lower('Inclusive Technology Prize')
    OR "applicationUrl" ILIKE '%disability-grants.org/inclusive-technology-prize%'
);
