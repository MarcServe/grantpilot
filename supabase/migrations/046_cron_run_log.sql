CREATE TABLE IF NOT EXISTS "CronRunLog" (
  "id" TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  "job_name" TEXT NOT NULL,
  "route" TEXT NOT NULL,
  "trigger" TEXT NOT NULL DEFAULT 'vercel',
  "status" TEXT NOT NULL CHECK ("status" IN ('success', 'failed')),
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "finished_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "duration_ms" INTEGER NOT NULL DEFAULT 0,
  "result" JSONB,
  "error" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "CronRunLog" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "CronRunLog_started_at_idx" ON "CronRunLog"("started_at" DESC);
CREATE INDEX IF NOT EXISTS "CronRunLog_status_idx" ON "CronRunLog"("status");
CREATE INDEX IF NOT EXISTS "CronRunLog_route_idx" ON "CronRunLog"("route");

COMMENT ON TABLE "CronRunLog" IS 'Internal operations trace for scheduled cron and Inngest jobs, used by the admin dashboard.';
