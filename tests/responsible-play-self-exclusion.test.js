import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const sql = read('supabase/migrations/20261018120000_self_exclusion_server_only.sql');
const edge = read('supabase/functions/ig-self-exclusion-v1/index.ts');
const page = read('original-app/src/pages/ResponsiblePlay.jsx');
const control = read('original-app/src/components/casino/SelfExclusionControl.jsx');

describe('player-initiated Supabase self-exclusion', () => {
  it('prevents client-accessible lifting or spoofing of exclusion', () => {
    expect(sql).toContain('ig_activate_self_exclusion');
    expect(sql).toContain('unique (user_id,request_id)');
    expect(sql).toContain('update public.profiles');
    expect(sql).toContain('set is_excluded=true');
    expect(sql).toContain('for update;');
    expect(sql).not.toMatch(/set\s+is_excluded\s*=\s*false/i);
    expect(sql).toContain('revoke all on function public.ig_activate_self_exclusion');
    expect(sql).toContain('to service_role');
    expect(sql).toContain('alter table public.ig_self_exclusion_events enable row level security');
    expect(sql).toContain('using (user_id = (select auth.uid()))');
  });
  it('uses a verified JWT/canonical role and blocks testers', () => {
    expect(edge).toContain('auth.auth.getUser(jwt)');
    expect(edge).toContain('db.from("profiles")');
    expect(edge).toContain('db.from("user_roles")');
    expect(edge).toContain('role.role === "tester"');
    expect(edge).toContain('p_user: user.id');
    expect(edge).toContain('playerCanReinstate: false');
    expect(edge).not.toContain('body.user_id');
    expect(edge).not.toContain('liftExclusion');
  });
  it('requires explicit confirmation before invoking irreversible restriction', () => {
    expect(control).toContain("confirmation === 'EXCLUDE' && agreed");
    expect(control).toContain('disabled={!valid || working}');
    expect(control).toContain("action: 'activate'");
    expect(control).toContain('await checkUserAuth()');
    expect(control).toContain("user.role !== 'tester'");
    expect(page).toContain('<SelfExclusionControl />');
  });
});
