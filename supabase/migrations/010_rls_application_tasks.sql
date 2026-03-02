-- RLS for ApplicationTask (Phase 2 Funding Task Engine). Run after 009_application_tasks.sql and 008_rls_hardening.sql.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ApplicationTask') THEN
    ALTER TABLE "ApplicationTask" ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "application_task_select_own_org"
      ON "ApplicationTask" FOR SELECT TO authenticated
      USING ("organisationId" = ANY(grantpilot_user_organisation_ids()));
    CREATE POLICY "application_task_insert_own_org"
      ON "ApplicationTask" FOR INSERT TO authenticated
      WITH CHECK ("organisationId" = ANY(grantpilot_user_organisation_ids()));
    CREATE POLICY "application_task_update_own_org"
      ON "ApplicationTask" FOR UPDATE TO authenticated
      USING ("organisationId" = ANY(grantpilot_user_organisation_ids()))
      WITH CHECK ("organisationId" = ANY(grantpilot_user_organisation_ids()));
    CREATE POLICY "application_task_delete_own_org"
      ON "ApplicationTask" FOR DELETE TO authenticated
      USING ("organisationId" = ANY(grantpilot_user_organisation_ids()));
  END IF;
END $$;
