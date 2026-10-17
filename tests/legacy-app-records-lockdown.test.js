import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const sql = readFileSync(
  new URL('../supabase/migrations/20261018102000_block_legacy_app_records_direct_writes.sql', import.meta.url),
  'utf8'
);

describe('legacy Base44 entity storage lockdown', () => {
  it('revokes direct client mutations and removes permissive RLS write policies', () => {
    expect(sql).toContain('revoke insert, update, delete on public.app_records from public, anon, authenticated');
    for (const name of ['app records create own','app records update own','app records delete own']) {
      expect(sql).toContain('drop policy if exists "'+name+'" on public.app_records');
    }
  });
  it('does not destroy existing data or remove support for audited reads', () => {
    expect(sql).not.toMatch(/\bdrop table\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/\bdelete from\b/i);
    expect(sql).not.toMatch(/revoke\s+select/i);
  });
});
