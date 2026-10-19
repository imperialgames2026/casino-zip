import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = path => readFileSync(new URL('../migration/legacy-overlay/' + path, import.meta.url), 'utf8');

describe('preserved casino migration adapter', () => {
  it('uses Supabase identity and not a Base44 network client', () => {
    const identity = read('src/lib/supabaseIdentity.js');
    const client = read('src/api/base44Client.js');
    expect(identity).toContain('auth.getUser()');
    expect(identity).toContain("from('user_roles')");
    expect(client).not.toContain("from '@base44/sdk'");
  });
  it('denies unsupported legacy mutations', () => {
    const code = read('src/api/base44Client.js');
    expect(code).toContain("deny('Wallet update')");
    expect(code).toContain("deny('Transaction create')");
    expect(code).toContain("deny('Legacy upload')");
    expect(code).toContain("deny('Legacy function '");
  });
  it('blocks old gameplay and account-sensitive routes', () => {
    const code = read('patch-app.mjs');
    expect(code).toContain("setStatus('unverified')");
    expect(code).toContain('const approvedRoutes = new Set([');
    expect(code).toContain("'/TransactionHistory'");
    expect(code).toContain('!approvedRoutes.has(currentRoute)');
    expect(code).not.toContain("'/Withdraw'");
    expect(code).not.toContain("'/KYCVerification'");
  });
});
