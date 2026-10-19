import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const file = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const edge = file('supabase/functions/provably-fair-v2/index.ts');
const page = file('original-app/src/pages/ProvablyFair.jsx');
const routes = file('original-app/src/App.jsx');
const verify = file('original-app/src/lib/fairness.ts');

describe('Original app ProvablyFair migrated to Supabase verified practice history', () => {
  it('only returns own revealed rounds, not unrevealed seeds or other users data', () => {
    const h = edge.indexOf('if(input.action==="history")');
    const status = edge.indexOf('.eq("user_id",user.id).eq("status","revealed")');
    const tester = edge.indexOf('if(roleRow?.role==="tester")');
    expect(h).toBeGreaterThan(-1);
    expect(status).toBeGreaterThan(h);
    expect(tester).toBeGreaterThan(status);
    expect(edge).toContain('if(Object.keys(input).length!==1)');
    expect(edge).toContain('practiceOnly:true');
    expect(edge).toContain('algorithm:"hmac-sha256-v2"');
    expect(edge).toContain('.limit(50)');
    expect(edge).toContain('"id,game,server_seed,server_seed_hash,client_seed,nonce,outcome,created_at,revealed_at"');
  });
  it('original UI verifies real seed and HMAC locally without legacy claims', () => {
    expect(page).toContain("functions.invoke('provably-fair-v2'");
    expect(page).toContain("body: { action: 'history' }");
    expect(page).toContain('verifyFairRound({');
    expect(page).toContain('staging practice rounds only');
    expect(page).not.toContain('base44.entities');
    expect(page).not.toContain('every Imperial Gaming round is generated');
    expect(verify).toContain('input.serverSeedHash');
    expect(verify).toContain('crypto.subtle.sign("HMAC"');
    expect(routes).toContain("'/ProvablyFair'");
  });
});
