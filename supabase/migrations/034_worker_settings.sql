-- Runtime worker settings (scout mode, etc.) editable from Admin UI without redeploying Fly.io.
-- If no row exists for a key, the worker falls back to environment variables.
CREATE TABLE IF NOT EXISTS public.worker_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.worker_settings IS 'Worker runtime config; scout_mode: off | regex | full';

ALTER TABLE public.worker_settings ENABLE ROW LEVEL SECURITY;
-- Only service role (Next.js admin API + worker) can read/write; no policies for anon/authenticated.
