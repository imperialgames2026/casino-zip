-- Baseline identity and ledger. Apply only after reviewing existing production schema.
create extension if not exists pgcrypto;
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text,
 role text not null default 'player' check (role in ('player','tester','admin','superadmin')),
 excluded boolean not null default false,
 created_at timestamptz not null default now()
);
create table if not exists public.wallets (
 user_id uuid not null references auth.users(id) on delete cascade,
 currency text not null check(currency in ('GC','SC')),
 balance bigint not null default 0 check(balance >= 0),
 primary key(user_id,currency)
);
create table if not exists public.ledger_entries (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 currency text not null check(currency in ('GC','SC')),
 delta bigint not null check(delta <> 0),
 operation_id uuid not null,
 created_at timestamptz not null default now(),
 unique(user_id,currency,operation_id)
);
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.ledger_entries enable row level security;
revoke all on public.wallets from anon, authenticated;
revoke all on public.ledger_entries from anon, authenticated;
grant select on public.wallets to authenticated;
grant select on public.ledger_entries to authenticated;
create policy "own wallet read" on public.wallets for select to authenticated using (user_id = (select auth.uid()));
create policy "own ledger read" on public.ledger_entries for select to authenticated using (user_id = (select auth.uid()));
create policy "own profile read" on public.profiles for select to authenticated using (id = (select auth.uid()));
-- Deliberately no client-side INSERT/UPDATE/DELETE policies for balances, ledger, roles or exclusion.
