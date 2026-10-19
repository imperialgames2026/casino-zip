import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const fn = read('supabase/functions/ig-admin-users-preview-v1/index.ts');
const page = read('original-app/src/pages/VerifiedAdminUsers.jsx');
const app = read('original-app/src/App.jsx');
const layout = read('original-app/src/components/VerifiedLayout.jsx');

describe('Base44 AdminUsers migration: staging read-only Superadmin boundary', () => {
  it('requires verified current user, canonical Superadmin role, and eligible account', () => {
    expect(fn).toContain('auth.auth.getUser(jwt)');
    expect(fn).toContain('user.is_anonymous');
    expect(fn).toContain('ownerRole?.role !== "superadmin"');
    expect(fn).toContain('profile.is_excluded !== false');
    expect(fn).toContain('db.from("user_roles")');
    expect(fn).toContain('STAGING_URL');
    expect(fn).toContain('qonqemhljgxlwpghkxhn');
  });
  it('has bounded, strict, read-only page requests and no financial or PII reads', () => {
    expect(fn).toContain('PAGE_SIZE = 25');
    expect(fn).toContain('MAX_PAGE = 39');
    expect(fn).toContain('Object.keys(input).every');
    expect(fn).toContain('input.action !== "list"');
    expect(fn).toContain('.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)');
    expect(fn).toContain('.select("id,display_name,created_at,is_excluded"');
    expect(fn).toContain('.select("user_id,role")');
    expect(fn).not.toMatch(/\.\s*(insert|upsert|update|delete|rpc)\s*\(/);
    expect(fn).not.toMatch(/auth\.admin\.listUsers|auth\.admin\.getUserById/);
    expect(fn).not.toContain('select("*")');
    expect(fn).not.toMatch(/\\.select\\([^\\n]*email/i);
    expect(fn).not.toContain('legacy_data');
  });
  it('replaces unsafe legacy admin UI with the verified preview route only', () => {
    expect(app).toContain("currentRoute === '/AdminUsers'");
    expect(app).toContain('<VerifiedAdminUsers />');
    expect(page).toContain("functions.invoke('ig-admin-users-preview-v1'");
    expect(page).toContain("user?.role === 'superadmin'");
    expect(page).not.toContain('base44.');
    expect(page).not.toContain('UserWallet.update');
    expect(page).not.toContain('Transaction.create');
    expect(layout).toContain("user?.role === 'superadmin'");
    expect(layout).toContain('to="/AdminUsers"');
    expect(page).toContain('read-only staging replacement');
  });
});
