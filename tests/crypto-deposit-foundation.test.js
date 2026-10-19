import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEPOSIT_NETWORKS, DEPOSITS_ENABLED, getDepositNetwork,
  isDepositEnabled, depositNetworkDisplay,
} from '../migration/legacy-overlay/src/lib/depositNetworks.js';

const sql = readFileSync(new URL('../supabase/migrations/20261017233000_crypto_deposit_network_catalog.sql', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../migration/legacy-overlay/src/components/casino/CryptoDepositNetworksPreview.jsx', import.meta.url), 'utf8');

describe('planned crypto deposit networks are disabled and unambiguous', () => {
  it('registers all 12 requested networks with unique IDs and native assets', () => {
    const names = DEPOSIT_NETWORKS.map(n => n.id);
    expect(names).toEqual([
      'solana', 'ethereum', 'bsc', 'arbitrum-one', 'op-mainnet', 'polygon-pos',
      'bitcoin', 'litecoin', 'xrpl', 'cardano', 'monero', 'zephyr',
    ]);
    expect(new Set(names).size).toBe(names.length);
    expect(DEPOSIT_NETWORKS.every(n => n.nativeAsset && n.label && n.family)).toBe(true);
    expect(getDepositNetwork('not-approved')).toBe(null);
    expect(getDepositNetwork('zephyr')?.nativeAsset).toBe('ZEPH');
  });

  it('has exact EVM chain IDs and only planned, unverified token capabilities', () => {
    const expected = { ethereum:1, bsc:56, 'arbitrum-one':42161, 'op-mainnet':10, 'polygon-pos':137 };
    const evm = DEPOSIT_NETWORKS.filter(n => n.family === 'evm');
    expect(Object.fromEntries(evm.map(n => [n.id, n.chainId]))).toEqual(expected);
    expect(DEPOSIT_NETWORKS.filter(n => n.family === 'solana')).toHaveLength(1);
    for (const network of DEPOSIT_NETWORKS) {
      if (network.family === 'evm' || network.family === 'solana') {
        expect(network.proposedStablecoins).toEqual(['USDT', 'USDC']);
      } else {
        expect(network.proposedStablecoins).toEqual([]);
      }
    }
  });

  it('never enables any asset, token, or deposit address in the initial build', () => {
    expect(DEPOSITS_ENABLED).toBe(false);
    const display = depositNetworkDisplay();
    expect(display).toHaveLength(12);
    expect(display.every(n => n.available === false)).toBe(true);
    for (const network of DEPOSIT_NETWORKS) {
      expect(network.enabled).toBe(false);
      expect(network.addressConfigured).toBe(false);
      expect(network.monitorVerified).toBe(false);
      expect(network.reconciliationVerified).toBe(false);
      expect(network.custodyVerified).toBe(false);
      expect(isDepositEnabled(network.id, network.nativeAsset)).toBe(false);
      for (const token of network.proposedStablecoins) {
        expect(isDepositEnabled(network.id, token)).toBe(false);
      }
    }
    expect(isDepositEnabled('ethereum','UNKNOWN')).toBe(false);
    expect(isDepositEnabled('unknown','USDC')).toBe(false);
  });

  it('locks all networks and assets off at the database layer', () => {
    expect(sql).toContain('enabled boolean not null default false check (enabled = false)');
    expect(sql).toContain('receiver_verified boolean not null default false check (receiver_verified = false)');
    expect(sql).toContain('token_issuer_verified boolean not null default false check (token_issuer_verified = false)');
    expect(sql).toContain("credit_status text not null default 'not_credited' check (credit_status = 'not_credited')");
    for (const table of ['crypto_deposit_networks','crypto_deposit_assets','crypto_deposit_observations']) {
      expect(sql).toContain('alter table public.' + table + ' enable row level security');
      expect(sql).toContain('revoke all on public.' + table + ' from public, anon, authenticated');
    }
    expect(sql).toContain('unique (network_id,tx_hash,output_index)');
    expect(sql).toContain('user_id = (select auth.uid())');
    expect(sql).not.toMatch(/grant\s+(?:insert|update|delete|all)\s+on\s+public\.crypto_deposit_observations\s+to\s+authenticated/i);
  });

  it('shows a read-only roadmap without enabling transfers', () => {
    expect(ui).toContain('No deposit addresses have been issued');
    expect(ui).toContain('Not accepting deposits');
    expect(ui).not.toContain('wallet.sendTransaction');
    expect(ui).not.toContain('recipient_address');
    expect(ui).not.toContain('depositAddress');
  });
});
