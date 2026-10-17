import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

describe("legacy weekly leaderboard migration security", () => {
  const sql = read("supabase/migrations/20261017223000_legacy_weekly_practice_leaderboard.sql");
  const edge = read("supabase/functions/legacy-leaderboard-v1/index.ts");
  const adapter = read("migration/legacy-overlay/src/api/base44Client.js");

  it("only service role can query aggregated practice winnings", () => {
    expect(sql).toContain("security invoker");
    expect(sql).toContain("t.status = 'completed'");
    expect(sql).toContain("t.currency = 'CENT'");
    expect(sql).toContain("p.is_excluded = false");
    expect(sql).toContain("limit 10");
    expect(sql).toContain("revoke all on function public.legacy_weekly_practice_leaderboard() from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.legacy_weekly_practice_leaderboard() to service_role");
    expect(sql).not.toMatch(/select\s+(?:.*\.)?email\b/i);
  });

  it("checks JWT, profile eligibility and canonical role before service RPC", () => {
    const jwt = edge.indexOf("auth.auth.getUser(token)");
    const excluded = edge.indexOf("profile.is_excluded !== false");
    const role = edge.indexOf("allowed.has(role.role)");
    const rpc = edge.indexOf('db.rpc("legacy_weekly_practice_leaderboard")');
    expect(jwt).toBeGreaterThan(-1);
    expect(excluded).toBeGreaterThan(jwt);
    expect(role).toBeGreaterThan(jwt);
    expect(rpc).toBeGreaterThan(excluded);
    expect(rpc).toBeGreaterThan(role);
    expect(edge).toContain('name: row.name');
    expect(edge).toContain('practiceOnly: true');
    expect(edge).not.toContain(".insert(");
    expect(edge).not.toContain(".update(");
  });

  it("only routes the explicitly whitelisted legacy function", () => {
    expect(adapter).toContain("name === 'getWeeklyTokenLeaderboard'");
    expect(adapter).toContain("functions.invoke('legacy-leaderboard-v1'");
    expect(adapter).toContain("return deny('Legacy function '");
  });
});
