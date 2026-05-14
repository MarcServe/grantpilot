-- User grant state: save/defer/apply/view tracking and notification suppression.
ALTER TABLE "SavedGrant"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'saved',
  ADD COLUMN IF NOT EXISTS "suppress_notifications" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "viewed_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "deferred_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "applied_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "dismissed_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'saved_grant_status_check'
  ) THEN
    ALTER TABLE "SavedGrant"
      ADD CONSTRAINT saved_grant_status_check
      CHECK ("status" IN ('saved', 'viewed', 'deferred', 'applied', 'dismissed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_saved_grant_suppressed
  ON "SavedGrant"("organisation_id", "profile_id", "grant_id")
  WHERE "suppress_notifications" = TRUE;

CREATE INDEX IF NOT EXISTS idx_saved_grant_status
  ON "SavedGrant"("organisation_id", "profile_id", "status", "updated_at");

COMMENT ON COLUMN "SavedGrant"."status" IS
  'User state for a grant: saved, viewed, deferred, applied, dismissed.';

COMMENT ON COLUMN "SavedGrant"."suppress_notifications" IS
  'When true, eligibility digests and deadline reminders should not resend this grant for the profile.';
