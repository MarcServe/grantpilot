-- Isolated Start Up Loans preparation progress. Existing intake access remains server-only.
ALTER TABLE "StartUpLoanIntake" ADD COLUMN IF NOT EXISTS "workspace" JSONB NOT NULL DEFAULT '{}'::jsonb;
NOTIFY pgrst, 'reload schema';
