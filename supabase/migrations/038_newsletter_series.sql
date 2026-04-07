-- Newsletter series: recipients, daily issues, and send logs (idempotent daily send).
-- This is intentionally separate from per-org eligibility digests.

CREATE TABLE IF NOT EXISTS "NewsletterRecipient" (
  "id" TEXT PRIMARY KEY DEFAULT generate_cuid(),
  "email" TEXT NOT NULL UNIQUE,
  "name" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "tags" TEXT[] NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE "NewsletterRecipient" IS 'External/public newsletter recipients list (ops-managed).';

CREATE TABLE IF NOT EXISTS "NewsletterIssue" (
  "id" TEXT PRIMARY KEY DEFAULT generate_cuid(),
  "issueDate" DATE NOT NULL UNIQUE,
  "templateKey" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "html" TEXT NOT NULL,
  "text" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE "NewsletterIssue" IS 'Daily generated newsletter issue payloads.';

CREATE TABLE IF NOT EXISTS "NewsletterSendLog" (
  "id" TEXT PRIMARY KEY DEFAULT generate_cuid(),
  "issueId" TEXT NOT NULL REFERENCES "NewsletterIssue"("id") ON DELETE CASCADE,
  "recipientEmail" TEXT NOT NULL,
  "status" TEXT NOT NULL CHECK ("status" IN ('sent', 'failed', 'skipped')),
  "error" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("issueId", "recipientEmail")
);

CREATE INDEX IF NOT EXISTS "NewsletterSendLog_issueId_idx" ON "NewsletterSendLog"("issueId");
CREATE INDEX IF NOT EXISTS "NewsletterSendLog_recipientEmail_idx" ON "NewsletterSendLog"("recipientEmail");

-- RLS: read-only for authenticated; mutations via service role only.
ALTER TABLE "NewsletterRecipient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NewsletterIssue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NewsletterSendLog" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "newsletter_recipient_read" ON "NewsletterRecipient"
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "newsletter_issue_read" ON "NewsletterIssue"
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "newsletter_sendlog_read" ON "NewsletterSendLog"
  FOR SELECT TO authenticated USING (true);

