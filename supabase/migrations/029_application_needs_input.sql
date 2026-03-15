-- Allow pausing an application when the worker needs user-provided answers (required form fields missing from profile)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'NEEDS_INPUT' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AppStatus')) THEN
    ALTER TYPE "AppStatus" ADD VALUE 'NEEDS_INPUT';
  END IF;
END $$;

ALTER TABLE "Application"
  ADD COLUMN IF NOT EXISTS "needs_input" JSONB,
  ADD COLUMN IF NOT EXISTS "needs_input_answers" JSONB;

COMMENT ON COLUMN "Application"."needs_input" IS 'When status=NEEDS_INPUT: list of { selector, label, hint } for required fields the profile did not have';
COMMENT ON COLUMN "Application"."needs_input_answers" IS 'User-supplied values for needs_input fields; worker merges into profile on resume';
