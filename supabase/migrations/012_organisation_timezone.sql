-- Optional timezone (IANA e.g. Europe/London) for morning notifications at 9am local.
ALTER TABLE "Organisation"
  ADD COLUMN IF NOT EXISTS "preferredTimezone" TEXT;

COMMENT ON COLUMN "Organisation"."preferredTimezone" IS 'IANA timezone (e.g. Europe/London) for 9am local deadline reminders. Null = UTC.';
