-- Compatibility-safe authorization addition for the existing Imperial Games staging schema.
-- Existing public.profiles already has a role enum; do not replace or alter it.
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'player' check (role in ('player','tester','admin','superadmin')),
  created_at timestamptz not null default now()
);
alter table public.user_roles enable row level security;
revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;
drop policy if exists "roles self read" on public.user_roles;
create policy "roles self read" on public.user_roles for select to authenticated using (user_id = (select auth.uid()));
-- Never grant client write access to authorization data.
-- Existing profile creation triggers and policies are intentionally preserved.
