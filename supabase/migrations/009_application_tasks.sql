-- Funding Task Engine (Phase 2): tasks attached to applications.
-- When an application is created, default tasks can be created (Review eligibility, Prepare documents, Submit).
-- Urgency is computed from due_date / grant deadline in the app layer.

CREATE TABLE IF NOT EXISTS "ApplicationTask" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "applicationId" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "grantId" TEXT,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'todo'
    CHECK ("status" IN ('todo', 'in_progress', 'done', 'cancelled')),
  "priority" TEXT NOT NULL DEFAULT 'medium'
    CHECK ("priority" IN ('high', 'medium', 'low')),
  "dueDate" TIMESTAMPTZ,
  "slug" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_application_task_application ON "ApplicationTask"("applicationId");
CREATE INDEX IF NOT EXISTS idx_application_task_org ON "ApplicationTask"("organisationId");
CREATE INDEX IF NOT EXISTS idx_application_task_status ON "ApplicationTask"("status");
CREATE INDEX IF NOT EXISTS idx_application_task_due ON "ApplicationTask"("dueDate");

COMMENT ON TABLE "ApplicationTask" IS 'Funding task engine: tasks (Review eligibility, Prepare documents, Submit) per application. Used in dashboard and reminder logic.';
