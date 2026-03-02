-- Multi-agent discovery (Phase 2 optional): tag grant origin for future discovery modules.
-- source: "default" | "claude" | "openai" | "gemini"

ALTER TABLE "Grant"
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'default';

UPDATE "Grant" SET "source" = 'default' WHERE "source" IS NULL;

COMMENT ON COLUMN "Grant"."source" IS 'Origin of grant: default (feed/manual), claude, openai, gemini for multi-agent discovery.';
