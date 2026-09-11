-- Local only — NEVER applied to Supabase.
--
-- Supabase gives every project an `auth` schema, an `auth.uid()` and the three
-- roles the policies name. A bare Postgres has none of them, so this shim
-- creates just enough of that surface for `psql -f` to run the real migrations
-- unchanged. If a migration needs anything else from Supabase, it belongs
-- here — not weakened in the migration.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique
);

-- The signed-in user, as the API sets it. Supabase reads a JWT claim; locally
-- a session GUC does the same job, which is also how a test impersonates
-- somebody.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
