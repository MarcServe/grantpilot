-- Grant Memory: canonical store of company/financials/team/traction/documents/pitch for instant prefill on new applications.
CREATE TABLE IF NOT EXISTS "GrantMemory" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organisation_id" TEXT NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "profile_id" TEXT NOT NULL REFERENCES "BusinessProfile"("id") ON DELETE CASCADE UNIQUE,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grant_memory_org ON "GrantMemory"("organisation_id");
CREATE INDEX IF NOT EXISTS idx_grant_memory_profile ON "GrantMemory"("profile_id");
COMMENT ON TABLE "GrantMemory" IS 'Canonical profile + application-derived data for instant prefill on new grant applications';

-- RLS
ALTER TABLE "GrantMemory" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Select own org grant memory"
  ON "GrantMemory" FOR SELECT TO authenticated
  USING ("organisation_id" = ANY(grantpilot_user_organisation_ids()));

CREATE POLICY "Insert own org grant memory"
  ON "GrantMemory" FOR INSERT TO authenticated
  WITH CHECK ("organisation_id" = ANY(grantpilot_user_organisation_ids()));

CREATE POLICY "Update own org grant memory"
  ON "GrantMemory" FOR UPDATE TO authenticated
  USING ("organisation_id" = ANY(grantpilot_user_organisation_ids()))
  WITH CHECK ("organisation_id" = ANY(grantpilot_user_organisation_ids()));
