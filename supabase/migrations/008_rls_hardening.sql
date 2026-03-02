-- Phase 2: RLS (Row Level Security) hardening
-- Enforces tenant and user isolation at the database layer.
-- Service role continues to bypass RLS; these policies apply when using authenticated user JWT.

-- ─── Helper functions (run with SECURITY DEFINER so they can read User/OrganisationMember under RLS) ───

CREATE OR REPLACE FUNCTION grantpilot_current_user_id()
RETURNS TEXT AS $$
  SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION grantpilot_current_user_id() IS 'Returns GrantPilot User.id for the current Supabase auth user (auth.uid()). Used by RLS policies.';

CREATE OR REPLACE FUNCTION grantpilot_user_organisation_ids()
RETURNS TEXT[] AS $$
  SELECT COALESCE(array_agg("organisationId"), ARRAY[]::TEXT[])
  FROM "OrganisationMember"
  WHERE "userId" = grantpilot_current_user_id();
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION grantpilot_user_organisation_ids() IS 'Returns organisation IDs the current user is a member of. Used by RLS policies.';

-- ─── User ─────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_select_own"
  ON "User" FOR SELECT TO authenticated
  USING ("supabaseId" = auth.uid()::text);

CREATE POLICY "user_update_own"
  ON "User" FOR UPDATE TO authenticated
  USING ("supabaseId" = auth.uid()::text)
  WITH CHECK ("supabaseId" = auth.uid()::text);

-- No INSERT/DELETE for authenticated (user creation is via webhook/service role).

-- ─── Organisation ───────────────────────────────────────────────────────────────────────────────────
ALTER TABLE "Organisation" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_select_member"
  ON "Organisation" FOR SELECT TO authenticated
  USING (id = ANY(grantpilot_user_organisation_ids()));

-- No INSERT/UPDATE/DELETE for authenticated (org creation is service role).

-- ─── OrganisationMember ───────────────────────────────────────────────────────────────────────────
ALTER TABLE "OrganisationMember" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_member_select_own_orgs"
  ON "OrganisationMember" FOR SELECT TO authenticated
  USING ("organisationId" = ANY(grantpilot_user_organisation_ids()));

-- No INSERT/UPDATE/DELETE for authenticated.

-- ─── BusinessProfile ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE "BusinessProfile" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_select_own_org"
  ON "BusinessProfile" FOR SELECT TO authenticated
  USING ("organisationId" = ANY(grantpilot_user_organisation_ids()));

CREATE POLICY "profile_insert_own_org"
  ON "BusinessProfile" FOR INSERT TO authenticated
  WITH CHECK ("organisationId" = ANY(grantpilot_user_organisation_ids()));

CREATE POLICY "profile_update_own_org"
  ON "BusinessProfile" FOR UPDATE TO authenticated
  USING ("organisationId" = ANY(grantpilot_user_organisation_ids()))
  WITH CHECK ("organisationId" = ANY(grantpilot_user_organisation_ids()));

CREATE POLICY "profile_delete_own_org"
  ON "BusinessProfile" FOR DELETE TO authenticated
  USING ("organisationId" = ANY(grantpilot_user_organisation_ids()));

-- ─── Document ────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_select_own_profile"
  ON "Document" FOR SELECT TO authenticated
  USING (
    "profileId" IN (
      SELECT id FROM "BusinessProfile"
      WHERE "organisationId" = ANY(grantpilot_user_organisation_ids())
    )
  );

CREATE POLICY "document_insert_own_profile"
  ON "Document" FOR INSERT TO authenticated
  WITH CHECK (
    "profileId" IN (
      SELECT id FROM "BusinessProfile"
      WHERE "organisationId" = ANY(grantpilot_user_organisation_ids())
    )
  );

CREATE POLICY "document_update_own_profile"
  ON "Document" FOR UPDATE TO authenticated
  USING (
    "profileId" IN (
      SELECT id FROM "BusinessProfile"
      WHERE "organisationId" = ANY(grantpilot_user_organisation_ids())
    )
  );

CREATE POLICY "document_delete_own_profile"
  ON "Document" FOR DELETE TO authenticated
  USING (
    "profileId" IN (
      SELECT id FROM "BusinessProfile"
      WHERE "organisationId" = ANY(grantpilot_user_organisation_ids())
    )
  );

-- ─── Application ──────────────────────────────────────────────────────────────────────────────────
ALTER TABLE "Application" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "application_select_own_org"
  ON "Application" FOR SELECT TO authenticated
  USING ("organisationId" = ANY(grantpilot_user_organisation_ids()));

CREATE POLICY "application_insert_own_org"
  ON "Application" FOR INSERT TO authenticated
  WITH CHECK ("organisationId" = ANY(grantpilot_user_organisation_ids()));

CREATE POLICY "application_update_own_org"
  ON "Application" FOR UPDATE TO authenticated
  USING ("organisationId" = ANY(grantpilot_user_organisation_ids()))
  WITH CHECK ("organisationId" = ANY(grantpilot_user_organisation_ids()));

-- No DELETE for authenticated (cancels are status updates).

-- ─── Usage ───────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE "Usage" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usage_select_own_org"
  ON "Usage" FOR SELECT TO authenticated
  USING ("organisationId" = ANY(grantpilot_user_organisation_ids()));

CREATE POLICY "usage_insert_own_org"
  ON "Usage" FOR INSERT TO authenticated
  WITH CHECK ("organisationId" = ANY(grantpilot_user_organisation_ids()));

-- No UPDATE/DELETE for authenticated.

-- ─── NotificationLog ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "NotificationLog" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_select_own"
  ON "NotificationLog" FOR SELECT TO authenticated
  USING ("userId" = grantpilot_current_user_id());

-- No INSERT/UPDATE/DELETE for authenticated (logging is server-side only).

-- ─── Grant ──────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE "Grant" ENABLE ROW LEVEL SECURITY;

-- Grants are read-only for all authenticated users (catalog).
CREATE POLICY "grant_select_authenticated"
  ON "Grant" FOR SELECT TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE for authenticated (ingest is service role).

-- ─── EligibilityAssessment (optional: only if table exists, e.g. after 005_eligibility_assessment.sql) ───
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'EligibilityAssessment') THEN
    ALTER TABLE "EligibilityAssessment" ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "eligibility_select_own_org"
      ON "EligibilityAssessment" FOR SELECT TO authenticated
      USING (organisation_id = ANY(grantpilot_user_organisation_ids()));
    CREATE POLICY "eligibility_insert_own_org"
      ON "EligibilityAssessment" FOR INSERT TO authenticated
      WITH CHECK (organisation_id = ANY(grantpilot_user_organisation_ids()));
    CREATE POLICY "eligibility_update_own_org"
      ON "EligibilityAssessment" FOR UPDATE TO authenticated
      USING (organisation_id = ANY(grantpilot_user_organisation_ids()))
      WITH CHECK (organisation_id = ANY(grantpilot_user_organisation_ids()));
    CREATE POLICY "eligibility_delete_own_org"
      ON "EligibilityAssessment" FOR DELETE TO authenticated
      USING (organisation_id = ANY(grantpilot_user_organisation_ids()));
  END IF;
END $$;

-- ─── cu_sessions ─────────────────────────────────────────────────────────────────────────────────
ALTER TABLE cu_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cu_sessions_select_own_org"
  ON cu_sessions FOR SELECT TO authenticated
  USING (organisation_id = ANY(grantpilot_user_organisation_ids()));

CREATE POLICY "cu_sessions_insert_own_org"
  ON cu_sessions FOR INSERT TO authenticated
  WITH CHECK (organisation_id = ANY(grantpilot_user_organisation_ids()));

CREATE POLICY "cu_sessions_update_own_org"
  ON cu_sessions FOR UPDATE TO authenticated
  USING (organisation_id = ANY(grantpilot_user_organisation_ids()))
  WITH CHECK (organisation_id = ANY(grantpilot_user_organisation_ids()));

-- ─── cu_session_items ──────────────────────────────────────────────────────────────────────────
ALTER TABLE cu_session_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cu_session_items_select_own_org"
  ON cu_session_items FOR SELECT TO authenticated
  USING (
    session_id IN (
      SELECT id FROM cu_sessions
      WHERE organisation_id = ANY(grantpilot_user_organisation_ids())
    )
  );

CREATE POLICY "cu_session_items_insert_own_org"
  ON cu_session_items FOR INSERT TO authenticated
  WITH CHECK (
    session_id IN (
      SELECT id FROM cu_sessions
      WHERE organisation_id = ANY(grantpilot_user_organisation_ids())
    )
  );

CREATE POLICY "cu_session_items_update_own_org"
  ON cu_session_items FOR UPDATE TO authenticated
  USING (
    session_id IN (
      SELECT id FROM cu_sessions
      WHERE organisation_id = ANY(grantpilot_user_organisation_ids())
    )
  );

-- ─── cu_session_logs ───────────────────────────────────────────────────────────────────────────
ALTER TABLE cu_session_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cu_session_logs_select_own_org"
  ON cu_session_logs FOR SELECT TO authenticated
  USING (
    session_id IN (
      SELECT id FROM cu_sessions
      WHERE organisation_id = ANY(grantpilot_user_organisation_ids())
    )
  );

-- No INSERT for authenticated (logging is server-side only).
