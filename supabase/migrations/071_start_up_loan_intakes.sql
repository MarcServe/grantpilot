CREATE TABLE IF NOT EXISTS "StartUpLoanIntake" (
  "id" TEXT PRIMARY KEY DEFAULT generate_cuid(),
  "organisationId" TEXT NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "profileId" TEXT NOT NULL REFERENCES "BusinessProfile"("id") ON DELETE CASCADE,
  "applicantId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "answers" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "shareWithAdviser" BOOLEAN NOT NULL DEFAULT false,
  "sourceVersion" TEXT NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("organisationId", "profileId", "applicantId")
);
ALTER TABLE "StartUpLoanIntake" ENABLE ROW LEVEL SECURITY;
-- No browser-role access: authenticated server endpoints enforce applicant ownership.
-- Administrator review endpoints additionally require the applicant's explicit sharing consent.
CREATE INDEX IF NOT EXISTS start_up_loan_intake_adviser ON "StartUpLoanIntake" ("shareWithAdviser", "updatedAt" DESC);
NOTIFY pgrst, 'reload schema';
