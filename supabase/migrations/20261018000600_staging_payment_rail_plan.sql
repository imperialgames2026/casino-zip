-- Staging payment-rail separation; user chooses CRYPTO IN / CRYPTO OUT.
-- Stripe is a LATER phase, not a dependency of crypto transfers.
-- All rails remain physically disabled during migration and compliance review.
create table if not exists public.ig_payment_rail_plan (
  rail_id text primary key check (rail_id in ('crypto_deposit','crypto_withdrawal','stripe_later')),
  settlement_class text not null check (settlement_class in ('native_crypto','future_fiat')),
  rollout_phase text not null check (rollout_phase in ('crypto_initial','deferred')),
  accepts_funds boolean not null default false check (accepts_funds = false),
  pays_funds boolean not null default false check (pays_funds = false),
  integration_approved boolean not null default false check (integration_approved = false),
  provider_connected boolean not null default false check (provider_connected = false),
  notes text not null,
  updated_at timestamptz not null default now()
);
alter table public.ig_payment_rail_plan enable row level security;
revoke all on public.ig_payment_rail_plan from public,anon,authenticated;
insert into public.ig_payment_rail_plan
  (rail_id,settlement_class,rollout_phase,notes)
values
  ('crypto_deposit','native_crypto','crypto_initial',
   'Planned per-user attributed addresses by blockchain; not live'),
  ('crypto_withdrawal','native_crypto','crypto_initial',
   'Planned crypto payouts; $2500 USD-equivalent review threshold, compliance screening and separate custody signing; not live'),
  ('stripe_later','future_fiat','deferred',
   'Stripe integration deferred by owner. No Stripe API credentials, payment intents, funding or wallet conversions.')
on conflict (rail_id) do nothing;

comment on table public.ig_payment_rail_plan is
'Staging roadmap only: crypto in and out first, Stripe deferred. No rail is enabled and there is no payment integration here.';
