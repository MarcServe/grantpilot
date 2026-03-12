-- Add WhatsApp as an option for eligibility notifications (high-fit / digest).
ALTER TABLE "EligibilityNotificationPreference"
  ADD COLUMN IF NOT EXISTS "notify_whatsapp" BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN "EligibilityNotificationPreference"."notify_whatsapp" IS 'Send eligibility/digest notifications via WhatsApp when user has opted in and template is configured';
