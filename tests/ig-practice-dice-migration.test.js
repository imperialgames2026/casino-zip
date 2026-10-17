import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const dice = read('original-app/src/pages/PlayDice.jsx');
const app = read('original-app/src/App.jsx');
const layout = read('original-app/src/Layout.jsx');

describe('Original casino Dice game converted to zero-wager Supabase practice', () => {
  it('uses only authenticated server-authoritative commitment/reveal with local verification', () => {
    expect(dice).toContain("functions.invoke('provably-fair-v2'");
    expect(dice).toContain("body: { action: 'commit', game: 'dice' }");
    expect(dice).toContain("body: { action: 'reveal', roundId: committed.id, clientSeed }");
    expect(dice).toContain('verifyFairRound({');
    expect(dice).toContain('crypto.randomUUID()');
    expect(dice).toContain('committed.server_seed_hash');
    expect(dice).toContain("'serverSeed' in committed");
    expect(dice).not.toContain('base44.entities');
    expect(dice).not.toContain('UserWallet.update');
    expect(dice).not.toContain('Transaction.create');
  });
  it('is explicitly nonfinancial and makes tester accounts read-only', () => {
    expect(dice).toContain("user?.role === 'tester'");
    expect(dice).toContain('disabled={rolling || isTester || !user || user?.is_excluded}');
    expect(dice).toContain('Practice only — no deposits, wagers, rewards, or withdrawals.');
    expect(dice).toContain('No balance changed.');
  });
  it('adds only this game to allowed preview routes', () => {
    expect(app).toContain("'/PlayDice'");
    expect(app).toContain('!approvedRoutes.has(currentRoute)');
    expect(layout).toContain("page: 'PlayDice'");
    expect(app).not.toContain("'/PlayPoker',");
    expect(app).not.toContain("'/PlaySlots',");
  });
});
