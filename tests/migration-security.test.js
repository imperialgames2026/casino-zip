import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
const sql = fs.readFileSync('supabase/migrations/20261017000100_identity_and_wallet.sql','utf8');
describe('baseline database security contract', () => {
 it('enables RLS on all identity and ledger tables', () => {
  for (const name of ['profiles','wallets','ledger_entries']) expect(sql).toContain('alter table public.'+name+' enable row level security');
 });
 it('does not grant client write access to wallet balances', () => {
  expect(sql).toContain('revoke all on public.wallets from anon, authenticated');
  expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)\s+on public.wallets to authenticated/i);
 });
 it('requires nonnegative balances and unique operations', () => {
  expect(sql).toContain('check(balance >= 0)');
  expect(sql).toContain('unique(user_id,currency,operation_id)');
 });
});
