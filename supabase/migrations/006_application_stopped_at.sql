-- Mark applications stopped by the user so UI can show "Stopped" instead of "Failed"
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Application' AND column_name = 'stopped_at') THEN
    ALTER TABLE "Application" ADD COLUMN "stopped_at" TIMESTAMPTZ;
  END IF;
END $$;

COMMENT ON COLUMN "Application"."stopped_at" IS 'Set when user stops the application; UI shows Stopped instead of Failed';
