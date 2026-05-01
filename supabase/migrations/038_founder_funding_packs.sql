-- Founder Funding Pack: generated business planning and visa/funding readiness documents.

CREATE TABLE IF NOT EXISTS "FounderFundingPack" (
  "id" TEXT PRIMARY KEY DEFAULT generate_cuid(),
  "organisationId" TEXT NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "profileId" TEXT NOT NULL REFERENCES "BusinessProfile"("id") ON DELETE CASCADE,
  "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "type" TEXT NOT NULL DEFAULT 'innovator_founder_visa',
  "status" TEXT NOT NULL DEFAULT 'generated',
  "inputs" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "content" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_founder_funding_pack_org ON "FounderFundingPack"("organisationId");
CREATE INDEX IF NOT EXISTS idx_founder_funding_pack_profile ON "FounderFundingPack"("profileId");
CREATE INDEX IF NOT EXISTS idx_founder_funding_pack_created ON "FounderFundingPack"("createdAt" DESC);

ALTER TABLE "FounderFundingPack" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "founder_pack_select_own_org"
  ON "FounderFundingPack" FOR SELECT TO authenticated
  USING ("organisationId" = ANY(grantpilot_user_organisation_ids()));

CREATE POLICY "founder_pack_insert_own_org"
  ON "FounderFundingPack" FOR INSERT TO authenticated
  WITH CHECK ("organisationId" = ANY(grantpilot_user_organisation_ids()));

CREATE POLICY "founder_pack_update_own_org"
  ON "FounderFundingPack" FOR UPDATE TO authenticated
  USING ("organisationId" = ANY(grantpilot_user_organisation_ids()))
  WITH CHECK ("organisationId" = ANY(grantpilot_user_organisation_ids()));

CREATE POLICY "founder_pack_delete_own_org"
  ON "FounderFundingPack" FOR DELETE TO authenticated
  USING ("organisationId" = ANY(grantpilot_user_organisation_ids()));

COMMENT ON TABLE "FounderFundingPack" IS 'Generated Founder Funding Pack documents: business plan, innovation statement, market analysis, financial projections, founder positioning, and evidence checklist.';
