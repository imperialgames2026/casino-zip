import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
const load = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const edge=load('supabase/functions/ig-poker-bot-lab/index.ts');
const sql=load('supabase/migrations/20261019043000_poker_staging_bot_accounts.sql');
const ui=load('original-app/src/pages/PokerBotLab.jsx');
const app=load('original-app/src/App.jsx');
const lobby=load('original-app/src/pages/PokerLobby.jsx');
const table=load('original-app/src/pages/PlayPoker.jsx');
describe('AI bot poker lab staging isolation',()=>{
 it('enforces Superadmin and dedicated staging project before any bot mutation',()=>{
  expect(edge).toContain('qonqemhljgxlwpghkxhn');
  expect(edge).toContain('auth.auth.getUser(bearer)');
  expect(edge).toContain('user.is_anonymous');
  expect(edge).toContain('profile.is_excluded!==false');
  expect(edge).toContain('role.role==="superadmin"');
  expect(edge).toContain('if(action!=="roster"&&!isAdmin)');
  expect(edge).toContain('ig_poker_lab_tables');
  expect(edge).not.toContain('p_actor:input');
 });
 it('provisions non-human, non-login bot accounts with separate visible AI BOT identities',()=>{
  for(const key of ['ace','baron','carl','wendy'])expect(edge).toContain('key:"'+key+'"');
  expect(edge).toContain('db.auth.admin.createUser');
  expect(edge).toContain('ban_duration:"876000h"');
  expect(edge).toContain('imperial_poker_bot:true');
  expect(edge).toContain('staging_only:true');
  expect(edge).toContain('crypto.getRandomValues(new Uint8Array(40))');
  expect(edge).toContain('example.invalid');
  expect(edge).not.toContain('email,password,account');
  expect(ui).toContain('AI BOT');
 });
 it('keeps bot tables and bot IDs hidden by default RLS and SQL grants',()=>{
  expect(sql).toContain('references auth.users(id)');
  expect(sql).toContain('enable row level security');
  expect(sql).toContain('revoke all on public.ig_poker_lab_bots from public,anon,authenticated');
  expect(sql).toContain('revoke all on public.ig_poker_lab_tables from public,anon,authenticated');
  expect(edge).toContain('Only seated players can inspect bot labels');
  expect(edge).toContain('Lab owner was not a registered bot');
  expect(edge).toContain('a human player has joined');
 });
 it('only uses practice poker core RPCs, no ledger or real-wallet actions',()=>{
  for(const v of ['poker_create_v1','poker_join_v1','poker_start_v2','poker_action_v3','poker_advance_v1','poker_settle_v1'])expect(edge).toContain(v);
  expect(edge).toContain('Practice chips not conserved after bot run');
  expect(edge).toContain('financialActionsEnabled:false');
  expect(edge).not.toContain('secure-wallet');
  expect(edge).not.toContain('user_wallet');
  expect(edge).not.toContain('ign_entries');
  expect(edge).not.toContain('.from("transactions")');
 });
 it('adds a Superadmin-only test lab and visible bot tags in poker UI',()=>{
  expect(app).toContain("currentRoute === '/PokerBotLab'");
  expect(app).toContain("user?.role !== 'superadmin'");
  expect(lobby).toContain('AI Poker Test Lab');
  expect(table).toContain('botLabels');
  expect(table).toContain("action: 'roster', tableId");
  expect(ui).toContain('Simulate a full hand');
  expect(ui).toContain('Provision four AI bot accounts');
 });
});
