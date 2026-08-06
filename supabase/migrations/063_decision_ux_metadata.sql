-- Decision UX metadata. Additive only; existing profiles and notification flows stay unchanged.

alter table "BusinessProfile"
  add column if not exists "fundingUrgency" text,
  add column if not exists "fundingPosition" text,
  add column if not exists "documentReadiness" text,
  add column if not exists "previousGrantHistory" text;

alter table "Grant"
  add column if not exists "opportunityType" text,
  add column if not exists "fundingValueType" text,
  add column if not exists "applicantMaxAmount" double precision,
  add column if not exists "applicantTypicalAmount" double precision,
  add column if not exists "programmeTotalAmount" double precision,
  add column if not exists "fundingValueEvidence" text;

alter table "EligibilityAssessment"
  add column if not exists "score_dimensions" jsonb,
  add column if not exists "confidence_state" text,
  add column if not exists "recommendation_category" text,
  add column if not exists "primary_blocker" text,
  add column if not exists "next_action" text;

create table if not exists "RecommendationFeedback" (
  id text primary key default gen_random_uuid()::text,
  organisation_id text not null,
  profile_id text,
  grant_id text not null,
  user_id text,
  category text not null check (
    category in (
      'relevant',
      'not_relevant',
      'expired',
      'wrong_location',
      'not_my_business_type',
      'already_applied'
    )
  ),
  note text,
  source text not null default 'card',
  created_at timestamptz not null default now()
);

create index if not exists "RecommendationFeedback_organisation_id_idx"
  on "RecommendationFeedback" (organisation_id);

create index if not exists "RecommendationFeedback_profile_id_idx"
  on "RecommendationFeedback" (profile_id);

create index if not exists "RecommendationFeedback_grant_id_idx"
  on "RecommendationFeedback" (grant_id);
