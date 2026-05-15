-- Multi-source discovery: tag grant origin for ops/debugging.
-- source examples: "default" | "claude" | "openai" | "gemini" | "perplexity" | "grants-gov" | "bing" | "google" | "admin"

ALTER TABLE "Grant"
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'default';

UPDATE "Grant" SET "source" = 'default' WHERE "source" IS NULL;

COMMENT ON COLUMN "Grant"."source" IS 'Origin finder for grant discovery/import. Customer-facing eligibility and notifications must pass through OpenAI scoring.';
