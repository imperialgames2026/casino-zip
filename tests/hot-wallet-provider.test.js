import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20261018000100_configure_hot_wallet_provider_candidate.sql');
const treasury = read('supabase/migrations/20261018000000_staging_hot_cold_treasury_accounts.sql');
const blueprint = read('docs/blueprints/HOT_WALLET_ELLIPAL_CUSTODY.md');

describe('HOT Wallet operating account and ELLIPAL cold reserve', () => {
  it('uses the specific HOT Wallet app and does not enable treasury operations', () => {
    expect(migration).toContain("provider_name = 'HOT Wallet (HOT Labs)'");
    expect(migration).toContain("account_id = 'operational-hot-wallet'");
    expect(migration).toContain("is_active = false");
    expect(migration).toContain("transfers_enabled = false");
    expect(treasury).toContain("('ellipal-cold-reserve','Imperial Games ELLIPAL Offline Reserve'");
  });

  it('requires review of business payout APIs and custody before enabling', () => {
    for (const flag of [
      'business_server_signing_verified',
      'independent_approval_policy_verified',
      'payout_api_verified',
      'per_user_deposit_address_derivation_verified',
      'every_requested_network_verified',
      'operationally_approved',
      'real_funds_enabled',
    ]) {
      expect(migration).toContain(flag + ' boolean not null default false');
      expect(migration).toContain('check (' + flag + ' = false)');
    }
    expect(migration).toContain("reference_url text not null default 'https://hot-labs.org/wallet/'");
  });

  it('retains $2500 Superadmin rule and no signing secrets', () => {
    expect(blueprint).toContain('$2,500 USD equivalent');
    expect(blueprint).toContain('Every withdrawal requires screening');
    expect(blueprint).toContain('air-gapped');
    expect(blueprint).toContain('unverified');
    expect(migration).not.toMatch(/(?:private_key|seed_phrase|mnemonic)\s+(?:text|bytea)/i);
  });
});
