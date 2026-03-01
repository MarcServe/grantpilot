-- Grant: store required attachment specs (video max duration/size, document types)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Grant' AND column_name = 'required_attachments') THEN
    ALTER TABLE "Grant" ADD COLUMN "required_attachments" JSONB DEFAULT '[]';
  END IF;
END $$;

-- Document: optional category for matching to grant requirements (e.g. pitch_video, financial_statement)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Document' AND column_name = 'category') THEN
    ALTER TABLE "Document" ADD COLUMN "category" TEXT;
  END IF;
END $$;

COMMENT ON COLUMN "Grant"."required_attachments" IS 'Array of { kind: "video"|"document", label: string, maxDurationMinutes?: number, maxSizeMB?: number, accept?: string, categoryHint?: string }';
COMMENT ON COLUMN "Document"."category" IS 'Optional category for grant matching: pitch_video, financial_statement, company_profile, business_plan, other';
