-- Score threshold above which grants are "eligible" (email + WhatsApp); below = "within reach" (email only).
ALTER TABLE "EligibilityNotificationPreference"
  ADD COLUMN IF NOT EXISTS "eligible_threshold" INTEGER NOT NULL DEFAULT 70
  CHECK ("eligible_threshold" >= 0 AND "eligible_threshold" <= 100);

COMMENT ON COLUMN "EligibilityNotificationPreference"."eligible_threshold" IS 'Grants with score >= this get email + WhatsApp (if opted in); below get email only (within reach).';
