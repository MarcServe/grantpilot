-- Embedding columns for vector similarity scoring (Layer 2).
-- Stored as JSON text arrays (no pgvector extension needed).
-- OpenAI text-embedding-3-small with 512 dimensions.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Grant') THEN
    ALTER TABLE public."Grant"
      ADD COLUMN IF NOT EXISTS "embedding" text;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'BusinessProfile') THEN
    ALTER TABLE public."BusinessProfile"
      ADD COLUMN IF NOT EXISTS "embedding" text;
  END IF;
END $$;
