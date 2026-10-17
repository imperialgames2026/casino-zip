-- Imperial Games identity and authorization baseline.
-- Apply via reviewed Supabase migrations. Never expose service-role credentials in the client.
create extension if not exists pgcrypto;
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'player' check (role in ('player','tester','admin','superadmin')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;
grant select, insert, update on public.profiles to authenticated;
drop policy if exists "profile self select" on public.profiles;
create policy "profile self select" on public.profiles for select to authenticated using (id = (select auth.uid()));
drop policy if exists "profile self insert" on public.profiles;
create policy "profile self insert" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
drop policy if exists "profile self update" on public.profiles;
create policy "profile self update" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
drop policy if exists "roles self read" on public.user_roles;
create policy "roles self read" on public.user_roles for select to authenticated using (user_id = (select auth.uid()));
-- No client-side write policy for roles: provisioning must occur through reviewed privileged backend.
create or replace function public.provision_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles(id) values (new.id) on conflict do nothing;
  insert into public.user_roles(user_id, role) values (new.id, 'player') on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_imperial on auth.users;
create trigger on_auth_user_created_imperial after insert on auth.users for each row execute function public.provision_user();
