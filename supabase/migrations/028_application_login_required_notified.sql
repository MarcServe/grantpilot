-- Idempotency for "application_login_required" notification: only notify once per application
ALTER TABLE "Application"
  ADD COLUMN IF NOT EXISTS "login_required_notified_at" TIMESTAMPTZ;

COMMENT ON COLUMN "Application"."login_required_notified_at" IS 'When we sent the login-required notification for this application (so we do not send again)';
