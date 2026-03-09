-- Store Twilio SID and status for WhatsApp (and other external IDs) so delivery can be traced in Twilio Console
ALTER TABLE "NotificationLog"
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;

COMMENT ON COLUMN "NotificationLog"."metadata" IS 'Optional payload, e.g. { "twilioSid": "SM...", "twilioStatus": "queued" } for WhatsApp';
