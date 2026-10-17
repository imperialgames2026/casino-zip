import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const profile = read('original-app/src/pages/Profile.jsx');
const history = read('original-app/src/pages/TransactionHistory.jsx');
const adapter = read('original-app/src/api/base44Client.js');
const reads = read('original-app/src/lib/supabaseLegacyReads.js');

describe('original Imperial Games account pages migrated to Supabase', () => {
  it('uses verified profile and owned staging wallet without unrestricted writes', () => {
    expect(profile).toContain("useAuth()");
    expect(profile).toContain("base44.entities.UserWallet.filter({ user_email: user?.email })");
    expect(profile).toContain("base44.functions.invoke('updateUsername'");
    expect(profile).toContain("user?.role !== 'tester'");
    expect(profile).not.toContain('UploadFile(');
    expect(profile).not.toContain('UserWallet.update');
    expect(profile).not.toContain('profile_picture:');
    expect(profile).toContain('internal test-currency balances');
    expect(profile).toContain('Real crypto deposits, withdrawals');
  });
  it('renders only account-owned staging transactions without legacy gift calls', () => {
    expect(history).toContain("base44.entities.Transaction.filter({ user_email: user.email }, '-created_date', 100)");
    expect(history).toContain("useAuth()");
    expect(history).toContain('staging-ledger history only');
    expect(history).not.toContain('WalletGift.');
    expect(history).not.toContain('Transaction.create');
    expect(history).not.toContain('base44.functions.invoke');
  });
  it('client reads are explicitly constrained to auth user ID', () => {
    expect(reads).toContain(".eq('user_id', identity.id)");
    expect(reads).toContain('filters.user_email !== identity.email');
    expect(reads).toContain("limit > 500");
    expect(adapter).toContain("return deny('Transaction create')");
    expect(adapter).toContain("return deny('Wallet update')");
  });
});
