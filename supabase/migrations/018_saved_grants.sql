-- Saved grants: per-profile list of grants to revisit and apply for later.
CREATE TABLE IF NOT EXISTS "SavedGrant" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organisation_id" TEXT NOT NULL,
  "profile_id" TEXT NOT NULL REFERENCES "BusinessProfile"("id") ON DELETE CASCADE,
  "grant_id" TEXT NOT NULL REFERENCES "Grant"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("organisation_id", "profile_id", "grant_id")
);

CREATE INDEX IF NOT EXISTS idx_saved_grant_org_profile ON "SavedGrant"("organisation_id", "profile_id");
CREATE INDEX IF NOT EXISTS idx_saved_grant_grant_id ON "SavedGrant"("grant_id");

COMMENT ON TABLE "SavedGrant" IS 'Grants saved by user to revisit and apply for later (save to profile).';

-- RLS
ALTER TABLE "SavedGrant" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_grant_select_own_org"
  ON "SavedGrant" FOR SELECT TO authenticated
  USING (organisation_id = ANY(grantpilot_user_organisation_ids()));

CREATE POLICY "saved_grant_insert_own_org"
  ON "SavedGrant" FOR INSERT TO authenticated
  WITH CHECK (organisation_id = ANY(grantpilot_user_organisation_ids()));

CREATE POLICY "saved_grant_delete_own_org"
  ON "SavedGrant" FOR DELETE TO authenticated
  USING (organisation_id = ANY(grantpilot_user_organisation_ids()));
