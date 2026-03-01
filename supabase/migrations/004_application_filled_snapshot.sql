-- Store filled form snapshot for in-app review before approval
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Application' AND column_name = 'filled_snapshot') THEN
    ALTER TABLE "Application" ADD COLUMN "filled_snapshot" JSONB;
  END IF;
END $$;

COMMENT ON COLUMN "Application"."filled_snapshot" IS 'Snapshot of form fields and file names after AI fill, for review before approval';
