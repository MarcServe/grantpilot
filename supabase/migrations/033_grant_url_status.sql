-- Track URL health for grant application links.
-- url_status: live, dead, expired, unknown
-- url_checked_at: last time the URL was verified
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Grant') THEN
    ALTER TABLE public."Grant"
      ADD COLUMN IF NOT EXISTS "url_status" text NOT NULL DEFAULT 'unknown',
      ADD COLUMN IF NOT EXISTS "url_checked_at" timestamptz;
  END IF;
END $$;
