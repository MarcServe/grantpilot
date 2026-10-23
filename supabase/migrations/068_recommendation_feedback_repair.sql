-- Restore feedback storage on projects that missed migration 063.
create table if not exists public."RecommendationFeedback" (
  id text primary key default gen_random_uuid()::text,
  organisation_id text not null,
  profile_id text,
  grant_id text not null,
  user_id text,
  category text not null check (category in (
    'relevant', 'not_relevant', 'expired', 'wrong_location',
    'not_my_business_type', 'already_applied'
  )),
  note text,
  source text not null default 'card',
  created_at timestamptz not null default now()
);
create index if not exists "RecommendationFeedback_organisation_id_idx" on public."RecommendationFeedback" (organisation_id);
create index if not exists "RecommendationFeedback_profile_id_idx" on public."RecommendationFeedback" (profile_id);
create index if not exists "RecommendationFeedback_grant_id_idx" on public."RecommendationFeedback" (grant_id);
-- Only the server service role writes feedback after checking workspace access.
alter table public."RecommendationFeedback" enable row level security;
notify pgrst, 'reload schema';
