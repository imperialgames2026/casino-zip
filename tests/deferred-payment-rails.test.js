import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../supabase/migrations/20261018000600_staging_payment_rail_plan.sql', import.meta.url),
  'utf8'
);

describe('Imperial Games crypto-first payment rail plan', () => {
  it('records crypto deposits and withdrawals as initial phase only', () => {
    expect(migration).toContain("('crypto_deposit','native_crypto','crypto_initial'");
    expect(migration).toContain("('crypto_withdrawal','native_crypto','crypto_initial'");
  });
  it('defers Stripe, PayPal and Cash App', () => {
    for (const rail of ['stripe_later','paypal_later','cash_app_later']) {
      expect(migration).toContain("('"+rail+"','future_fiat','deferred'");
    }
    expect(migration).toContain('No personal P2P transfers');
    expect(migration).toContain('business payment APIs');
  });
  it('prevents all live payments at database level', () => {
    for (const flag of ['accepts_funds','pays_funds','integration_approved','provider_connected']) {
      expect(migration).toContain(flag+' boolean not null default false check ('+flag+' = false)');
    }
    expect(migration).toContain('alter table public.ig_payment_rail_plan enable row level security');
    expect(migration).toContain('revoke all on public.ig_payment_rail_plan from public,anon,authenticated');
  });
});
