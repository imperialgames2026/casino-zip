import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const profile = read('original-app/src/pages/Profile.jsx');
const history = read('original-app/src/pages/TransactionHistory.jsx');
const adapter = read('original-app/src/api/base44Client.js');
const reads = read('original-app/src/lib/supabaseLegacyReads.js');
const identity = read('original-app/src/lib/supabaseIdentity.js');

describe('original account pages invoke Supabase directly', () => {
  it('uses verified profile and own staging wallet without unrestricted writes', () => {
    expect(profile).toContain('useAuth()');
    expect(profile).toContain('readOwnWallet({ user_email: user?.email })');
    expect(profile).toContain('setOneTimeDisplayName(candidate)');
    expect(profile).toContain("user?.role !== 'tester'");
    expect(profile).not.toContain("from '@/api/base44Client'");
    expect(profile).not.toContain('UploadFile(');
    expect(profile).not.toContain('UserWallet.update');
    expect(profile).not.toContain('profile_picture:');
    expect(profile).toContain('internal test-currency balances');
    expect(profile).toContain('Real crypto deposits, withdrawals');
  });
  it('renders only account-owned staging transactions without legacy gift calls', () => {
    expect(history).toContain("readOwnTransactions({ user_email: user.email }, '-created_date', 100)");
    expect(history).toContain('useAuth()');
    expect(history).toContain('staging-ledger history only');
    expect(history).not.toContain("from '@/api/base44Client'");
    expect(history).not.toContain('WalletGift.');
    expect(history).not.toContain('Transaction.create');
  });
  it('keeps owner scoping and legacy write blocks while removing adapter reliance', () => {
    expect(reads).toContain(".eq('user_id', identity.id)");
    expect(reads).toContain('filters.user_email !== identity.email');
    expect(reads).toContain('limit > 500');
    expect(identity).toContain("export async function setOneTimeDisplayName");
    expect(identity).toContain(".eq('id', account.id)");
    expect(identity).toContain(".is('display_name', null)");
    expect(identity).toContain('data?.display_name !== value');
    expect(adapter).toContain("deny('Transaction create')");
    expect(adapter).toContain("deny('Wallet update')");
  });
});
