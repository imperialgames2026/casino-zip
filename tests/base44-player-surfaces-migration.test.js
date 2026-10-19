import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const app = read('original-app/src/App.jsx');
const catalog = read('original-app/src/pages/VerifiedPracticeCatalog.jsx');
const leaderboard = read('original-app/src/pages/VerifiedPracticeLeaderboard.jsx');
const stats = read('original-app/src/pages/VerifiedPlayerAnalytics.jsx');
const kyc = read('original-app/src/pages/VerifiedKYCStatus.jsx');
const fn = read('supabase/functions/ig-player-analytics-v1/index.ts');

describe('Base44 migration: safe read-only player surfaces', () => {
  it('uses verified, exclusion-aware route gates before legacy fallback', () => {
    const excluded = app.indexOf("if (user?.is_excluded && currentRoute !== '/Support')");
    const route = app.indexOf("if (currentRoute === '/Games')");
    const fallback = app.indexOf("if (!approvedRoutes.has(currentRoute))");
    expect(excluded).toBeGreaterThan(-1);
    expect(route).toBeGreaterThan(excluded);
    expect(fallback).toBeGreaterThan(route);
    for (const [path, component] of [
      ['/Games','VerifiedPracticeCatalog'],
      ['/Leaderboard','VerifiedPracticeLeaderboard'],
      ['/ProfileStats','VerifiedPlayerAnalytics'],
      ['/KYCVerification','VerifiedKYCStatus'],
    ]) {
      expect(app).toContain("currentRoute === '" + path + "'");
      expect(app).toContain('<' + component + ' />');
    }
  });
  it('catalog never emits unreviewed financial or unapproved game links', () => {
    expect(catalog).toContain("readApprovedPracticeGames({ is_active: true })");
    expect(catalog).toContain("new Set(['/PlayDice'])");
    expect(catalog).toContain('g.practice_only === true');
    expect(catalog).toContain('g.real_wagers_enabled === false');
    expect(catalog).not.toContain('UserWallet');
    expect(catalog).not.toContain('base44');
  });
  it('leaderboard reads server-side pseudonymous, nonredeemable aggregates only', () => {
    expect(leaderboard).toContain("functions.invoke('legacy-leaderboard-v1'");
    expect(leaderboard).toContain('data.practiceOnly !== true');
    expect(leaderboard).not.toContain('UserWallet.list');
    expect(leaderboard).not.toContain('cat_dollars');
  });
  it('analytics binds authenticated user and server-archived hands, never a client actor', () => {
    expect(fn).toContain('client.auth.getUser(token)');
    expect(fn).toContain('user.is_anonymous');
    expect(fn).toContain('profile.is_excluded !== false');
    expect(fn).toContain('ROLES.has(role.role)');
    expect(fn).toContain('.eq("user_id", user.id)');
    expect(fn).toContain('"ig_poker_hand_facts"');
    expect(fn).toContain('"ig_poker_decision_grades"');
    expect(fn).toContain('"server_archived_completed_hands"');
    expect(fn).toContain('eligible = n >= 100 && gradeRows.length >= 50 && revisions.length === 1');
    expect(fn).toContain('opportunities > 0 ?');
    expect(fn).not.toMatch(/\.(insert|upsert|update|delete)\s*\(/);
    expect(fn).not.toContain('p_actor: body');
    expect(stats).toContain("functions.invoke('ig-player-analytics-v1'");
    expect(stats).not.toContain('PokerHandRecord.list');
    expect(stats).not.toContain('UserWallet.filter');
  });
  it('replaces unverified KYC uploads with verified profile status only', () => {
    expect(kyc).toContain('user?.kyc_status');
    expect(kyc).toContain('Uploads are not active');
    expect(kyc).not.toContain('UploadFile(');
    expect(kyc).not.toContain('sendPhoneVerification');
  });
});
