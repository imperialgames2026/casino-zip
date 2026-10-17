import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const sql = read('supabase/migrations/20261018113000_approved_practice_game_catalog.sql');
const adapter = read('original-app/src/api/base44Client.js');
const reads = read('original-app/src/lib/supabaseLegacyReads.js');
const card = read('original-app/src/components/casino/GameCard.jsx');

describe('approved practice-only original game catalog', () => {
  it('has only verified zero-wager Dice active in staging', () => {
    expect(sql).toContain("'provably-fair-v2'");
    expect(sql).toContain("'dice','Practice Dice'");
    expect(sql).toContain("'/PlayDice'");
    expect(sql).toContain('real_wagers_enabled boolean not null default false check (real_wagers_enabled = false)');
    expect(sql).toContain('practice_only boolean not null default true check (practice_only = true)');
    expect(sql).toContain('using (is_active and practice_only and not real_wagers_enabled)');
    expect(sql).not.toContain("'blackjack','");
    expect(sql).not.toContain("'poker','");
  });
  it('only returns authenticated non-excluded player-safe rows and blocks writes', () => {
    expect(reads).toContain('export async function readApprovedPracticeGames');
    expect(reads).toContain('const identity = await currentIdentity()');
    expect(reads).toContain("if (identity.is_excluded)");
    expect(reads).toContain(".eq('practice_only', true).eq('real_wagers_enabled', false)");
    expect(adapter).toContain("name === 'Game'");
    expect(adapter).toContain('filter: readApprovedPracticeGames');
    for(const method of ['Create game','Update game','Delete game'])expect(adapter).toContain(method);
    expect(sql).toContain('revoke all on public.ig_practice_game_catalog from public,anon,authenticated');
    expect(sql).toContain('grant select on public.ig_practice_game_catalog to authenticated');
  });
  it('does not reference external Base44-hosted artwork for practice-game cards', () => {
    expect(card).toContain('Server verified · Practice only');
    expect(card).not.toContain('media.base44.com');
  });
});
