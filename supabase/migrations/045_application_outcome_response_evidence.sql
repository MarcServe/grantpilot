-- Add funder response evidence to application outcomes for outcome-learning.

ALTER TABLE "ApplicationOutcome"
  ADD COLUMN IF NOT EXISTS "responseText" TEXT,
  ADD COLUMN IF NOT EXISTS "responseScreenshotName" TEXT,
  ADD COLUMN IF NOT EXISTS "responseScreenshotDataUrl" TEXT;

COMMENT ON COLUMN "ApplicationOutcome"."responseText" IS
  'User-pasted funder response, email text, or portal message used for outcome learning.';

COMMENT ON COLUMN "ApplicationOutcome"."responseScreenshotName" IS
  'Original uploaded screenshot file name for the funder response evidence.';

COMMENT ON COLUMN "ApplicationOutcome"."responseScreenshotDataUrl" IS
  'Small screenshot evidence data URL. Intended for MVP review and learning; move to object storage for larger production files.';
