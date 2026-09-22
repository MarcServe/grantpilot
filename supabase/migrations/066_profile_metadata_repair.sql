-- Repair profile metadata for deployments that missed migration 063.
-- Additive and safe to rerun; existing values are preserved.
ALTER TABLE "BusinessProfile"
  ADD COLUMN IF NOT EXISTS "fundingUrgency" text,
  ADD COLUMN IF NOT EXISTS "fundingPosition" text,
  ADD COLUMN IF NOT EXISTS "documentReadiness" text,
  ADD COLUMN IF NOT EXISTS "previousGrantHistory" text;
NOTIFY pgrst, 'reload schema';
