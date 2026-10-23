begin;

-- One-time setup. Keys are encrypted in Vault; plaintext never lives in public tables.
create schema if not exists vault;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.ai_provider_settings (
  provider text primary key check (provider in ('openai','perplexity','claude','gemini','apify')),
  enabled boolean not null default true,
  vault_secret_id uuid references vault.secrets(id),
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.ai_provider_settings enable row level security;
revoke all on public.ai_provider_settings from public, anon, authenticated;
grant select, insert, update, delete on public.ai_provider_settings to service_role;

create or replace function public.ai_provider_read(p_provider text)
returns table (api_key text, enabled boolean, updated_at timestamptz)
language sql security definer set search_path = '' as $$
  select v.decrypted_secret, s.enabled, s.updated_at
  from public.ai_provider_settings s
  left join vault.decrypted_secrets v on v.id = s.vault_secret_id
  where s.provider = p_provider;
$$;

create or replace function public.ai_provider_save(p_provider text, p_api_key text, p_enabled boolean, p_updated_by text)
returns void language plpgsql security definer set search_path = '' as $$
declare secret_id uuid;
begin
  if p_provider not in ('openai','perplexity','claude','gemini','apify') then raise exception 'Unknown provider'; end if;
  if p_enabled is null then raise exception 'Enabled is required'; end if;
  if p_api_key is not null and (length(trim(p_api_key)) < 8 or length(p_api_key) > 4096) then raise exception 'Invalid key length'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('ai-provider:' || p_provider));
  select vault_secret_id into secret_id from public.ai_provider_settings where provider = p_provider;
  if p_api_key is not null then
    if secret_id is null then
      secret_id := vault.create_secret(trim(p_api_key), 'grantscopilot-ai-' || p_provider, 'Admin-managed AI provider credential');
    else
      perform vault.update_secret(secret_id, trim(p_api_key));
    end if;
  end if;
  insert into public.ai_provider_settings(provider, enabled, vault_secret_id, updated_by)
    values (p_provider, p_enabled, secret_id, p_updated_by)
  on conflict (provider) do update set enabled = excluded.enabled, vault_secret_id = excluded.vault_secret_id,
    updated_at = now(), updated_by = excluded.updated_by;
end;
$$;

create or replace function public.ai_provider_reset(p_provider text)
returns void language plpgsql security definer set search_path = '' as $$
declare secret_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('ai-provider:' || p_provider));
  delete from public.ai_provider_settings where provider = p_provider returning vault_secret_id into secret_id;
  if secret_id is not null then delete from vault.secrets where id = secret_id; end if;
end;
$$;

revoke all on function public.ai_provider_read(text) from public, anon, authenticated;
revoke all on function public.ai_provider_save(text,text,boolean,text) from public, anon, authenticated;
revoke all on function public.ai_provider_reset(text) from public, anon, authenticated;
grant execute on function public.ai_provider_read(text) to service_role;
grant execute on function public.ai_provider_save(text,text,boolean,text) to service_role;
grant execute on function public.ai_provider_reset(text) to service_role;
notify pgrst, 'reload schema';

commit;
