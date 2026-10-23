-- Additive rollout. Existing AI assessments are retained; absence means unverified.
CREATE TABLE IF NOT EXISTS grant_criteria_documents (
  grant_id TEXT PRIMARY KEY REFERENCES "Grant"(id) ON DELETE CASCADE,
  document JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS grant_criteria_answers (
  organisation_id TEXT NOT NULL REFERENCES "Organisation"(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES "BusinessProfile"(id) ON DELETE CASCADE,
  grant_id TEXT NOT NULL REFERENCES "Grant"(id) ON DELETE CASCADE,
  criterion_id TEXT NOT NULL,
  answer JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, profile_id, grant_id, criterion_id)
);
CREATE TABLE IF NOT EXISTS criteria_refresh_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id TEXT NOT NULL REFERENCES "Organisation"(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES "BusinessProfile"(id) ON DELETE CASCADE,
  grant_id TEXT REFERENCES "Grant"(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed')),
  before_matches JSONB NOT NULL DEFAULT '{}',
  reextract BOOLEAN NOT NULL DEFAULT false,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS criteria_refresh_profile_idx ON criteria_refresh_runs(organisation_id, profile_id, created_at DESC);
CREATE TABLE IF NOT EXISTS grant_preparation_checks (
  organisation_id TEXT NOT NULL REFERENCES "Organisation"(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES "BusinessProfile"(id) ON DELETE CASCADE,
  grant_id TEXT NOT NULL REFERENCES "Grant"(id) ON DELETE CASCADE,
  requirement_id TEXT NOT NULL,
  source_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('needed','draft','reviewed')),
  evidence TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, profile_id, grant_id, requirement_id)
);
ALTER TABLE grant_criteria_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE grant_criteria_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE criteria_refresh_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE grant_preparation_checks ENABLE ROW LEVEL SECURITY;
-- Deliberately no client policies: all access is through authenticated, profile-scoped server routes.

CREATE UNIQUE INDEX IF NOT EXISTS criteria_one_active_run_per_profile ON criteria_refresh_runs(organisation_id, profile_id) WHERE status IN ('queued','running');
CREATE TABLE IF NOT EXISTS grant_criteria_assessments (
  organisation_id TEXT NOT NULL REFERENCES "Organisation"(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES "BusinessProfile"(id) ON DELETE CASCADE,
  grant_id TEXT NOT NULL REFERENCES "Grant"(id) ON DELETE CASCADE,
  assessment JSONB NOT NULL,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, profile_id, grant_id)
);
ALTER TABLE grant_criteria_assessments ENABLE ROW LEVEL SECURITY;
