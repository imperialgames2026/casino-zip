import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const file = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const custody = file('supabase/migrations/20261018000000_staging_hot_cold_treasury_accounts.sql');
const policy = file('supabase/migrations/20261017235600_staging_crypto_withdrawal_policy.sql');
const destinations = file('supabase/migrations/20261017235500_user_crypto_deposit_destinations.sql');
const provisioning = file('supabase/migrations/20261017235700_provision_pending_crypto_routes.sql');

describe('Imperial Games staging treasury: hot operating / ELLIPAL cold reserve', () => {
  it('keeps offline ELLIPAL and dedicated hot account separate and disabled', () => {
    expect(custody).toContain('ellipal-cold-reserve');
    expect(custody).toContain('operational-hot-wallet');
    expect(custody).toContain('ellipal_air_gapped_offline');
    expect(custody).toContain('independent_online_custody');
    expect(custody).toContain("'provider_to_be_confirmed'");
    expect(custody).toContain('transfers_enabled boolean not null default false check (transfers_enabled = false)');
    expect(custody).toContain('check (chain_address is null and custody_reference is null and last_verified_at is null)');
    expect(custody).toContain('manual_offline_cold_signing_required boolean not null default true');
    expect(custody).toContain('second_person_control_for_cold_movements boolean not null default true');
    expect(custody).toContain('automated_hot_wallet_payouts_enabled boolean not null default false');
  });

  it('retains review thresholds, universal screening and no real payouts', () => {
    expect(policy).toContain("values ('staging-default',2500.00");
    expect(policy).toContain('screen_every_transaction boolean not null default true check (screen_every_transaction = true)');
    expect(policy).toContain('independent_custody_signer_required boolean not null default true');
    expect(policy).toContain('real_deposits_enabled boolean not null default false');
    expect(policy).toContain('real_withdrawals_enabled boolean not null default false');
    expect(policy).toContain("'can_release_funds',false");
    expect(custody).toContain('approval_threshold_usd numeric(20,2) not null default 2500.00');
    expect(custody).toContain('compliance_screen_every_withdrawal boolean not null default true');
  });

  it('makes each player destination pending and private, with no key or address generation', () => {
    expect(destinations).toContain('unique (user_id,network_id)');
    expect(destinations).toContain('check (deposit_address is null and destination_tag is null and custody_provider_ref is null)');
    expect(destinations).toContain('using (user_id = (select auth.uid()))');
    expect(provisioning).toContain('on conflict (user_id,network_id) do nothing');
    expect(provisioning).toContain('after insert on public.profiles');
    expect(custody).not.toMatch(/(mnemonic|seed_phrase|private_key)\s+text\b/i);
  });
});
