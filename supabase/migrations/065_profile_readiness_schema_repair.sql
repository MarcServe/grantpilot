-- Repair installations where the decision UX profile columns were not applied.
-- Safe to run repeatedly; existing values are retained.
alter table public."BusinessProfile"
  add column if not exists "fundingUrgency" text,
  add column if not exists "fundingPosition" text,
  add column if not exists "documentReadiness" text,
  add column if not exists "previousGrantHistory" text;

-- Move answers preserved by the compatibility save path into their own columns.
do $$
declare
  profile_row record;
  metadata jsonb;
  marker text := E'\n\n[GrantsCopilot readiness metadata]\n';
  marker_at integer;
begin
  for profile_row in select id, "fundingDetails" from public."BusinessProfile"
    where strpos(coalesce("fundingDetails", ''), marker) > 0
  loop
    marker_at := strpos(profile_row."fundingDetails", marker);
    begin
      metadata := substring(profile_row."fundingDetails" from marker_at + length(marker))::jsonb;
      if jsonb_typeof(metadata) <> 'object' then continue; end if;
    exception when invalid_text_representation then
      continue;
    end;
    update public."BusinessProfile" set
      "fundingUrgency" = coalesce(nullif("fundingUrgency", ''), metadata->>'fundingUrgency'),
      "fundingPosition" = coalesce(nullif("fundingPosition", ''), metadata->>'fundingPosition'),
      "documentReadiness" = coalesce(nullif("documentReadiness", ''), metadata->>'documentReadiness'),
      "previousGrantHistory" = coalesce(nullif("previousGrantHistory", ''), metadata->>'previousGrantHistory'),
      "fundingDetails" = left(profile_row."fundingDetails", marker_at - 1)
    where id = profile_row.id;
  end loop;
end $$;

notify pgrst, 'reload schema';
