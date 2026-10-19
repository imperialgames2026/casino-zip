import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const migration = source('supabase/migrations/20261018100000_support_tickets_backend.sql');
const endpoint = source('supabase/functions/ig-support-v1/index.ts');
const userPage = source('original-app/src/pages/Support.jsx');
const staffPage = source('original-app/src/pages/AdminSupport.jsx');
const app = source('original-app/src/App.jsx');
const launcher = source('original-app/src/components/support/SupportChatWidget.jsx');

describe('Base44 SupportChat migration to Supabase tickets', () => {
  it('uses atomic idempotent backend writes and private tables', () => {
    expect(migration).toContain('unique (user_id, request_id)');
    expect(migration).toContain('unique (ticket_id,request_id)');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('select * into v_ticket');
    for (const table of ['ig_support_tickets','ig_support_messages']) {
      expect(migration).toContain('alter table public.'+table+' enable row level security');
      expect(migration).toContain('revoke all on public.'+table+' from public,anon,authenticated');
    }
    for (const name of ['ig_support_open','ig_support_post','ig_support_staff_status']) {
      expect(migration).toContain('revoke all on function public.'+name);
      expect(migration).toContain('grant execute on function public.'+name);
    }
  });
  it('never trusts a client-supplied identity or a client claim to staff membership', () => {
    const jwt = endpoint.indexOf('auth.auth.getUser(jwt)');
    const identity = endpoint.indexOf('db.from("user_roles")');
    const isStaff = endpoint.indexOf('const isStaff = staff.has(role.role) && profile.is_excluded === false');
    const write = endpoint.indexOf('db.rpc("ig_support_open"');
    expect(jwt).toBeGreaterThan(-1);
    expect(identity).toBeGreaterThan(jwt);
    expect(isStaff).toBeGreaterThan(identity);
    expect(write).toBeGreaterThan(isStaff);
    expect(endpoint).toContain('p_user: user.id');
    expect(endpoint).toContain('p_actor: user.id');
    expect(endpoint).toContain('p_is_staff: isStaff');
    expect(endpoint).toContain('.eq("user_id", user.id)');
    expect(endpoint).toContain('!isStaff && ticket.user_id !== user.id');
    expect(endpoint).not.toContain('body.user_id');
    expect(endpoint).not.toContain('body.is_staff');
    expect(endpoint).not.toContain('@base44/sdk');
    expect(endpoint).not.toContain('SendEmail');
  });
  it('replaces original support and staff UI with real server endpoints', () => {
    expect(userPage).toContain("functions.invoke('ig-support-v1'");
    expect(userPage).toContain("invoke('open'");
    expect(userPage).toContain("invoke('post'");
    expect(userPage).toContain("invoke('mine')");
    expect(userPage).not.toContain('InvokeLLM');
    expect(staffPage).toContain("functions.invoke('ig-support-v1'");
    expect(staffPage).toContain("invoke('queue')");
    expect(staffPage).toContain("invoke('status'");
    expect(staffPage).toContain("user?.role === 'superadmin'");
    expect(launcher).toContain('to="/Support"');
    expect(launcher).not.toContain('base44');
  });
  it('re-checks routes reactively and permits excluded user appeals but not blocked staff', () => {
    expect(app).toContain('useLocation()');
    expect(app).toContain('routeLocation.pathname');
    expect(app).toContain("user?.is_excluded && currentRoute !== '/Support'");
    expect(app).toContain("'/Support', '/AdminSupport'");
    expect(app).toContain("!['admin', 'superadmin'].includes(user?.role)");
    expect(app).toContain('!approvedRoutes.has(currentRoute)');
  });
});
