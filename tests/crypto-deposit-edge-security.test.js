import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = file => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const edge = read("supabase/functions/crypto-deposit-preview-v1/index.ts");
const preview = read("migration/legacy-overlay/patch-app.mjs");

describe("read-only crypto capability Edge function", () => {
  it("checks identity, profile and role before accessing catalog or observations", () => {
    const jwt = edge.indexOf("auth.auth.getUser(jwt)");
    const profile = edge.indexOf('db.from("profiles")');
    const role = edge.indexOf('db.from("user_roles")');
    const eligibility = edge.indexOf("profile.is_excluded !== false");
    const catalog = edge.indexOf('db.from("crypto_deposit_networks")');
    const observations = edge.indexOf('db.from("crypto_deposit_observations")');
    expect(jwt).toBeGreaterThan(-1);
    expect(profile).toBeGreaterThan(jwt);
    expect(role).toBeGreaterThan(jwt);
    expect(eligibility).toBeGreaterThan(profile);
    expect(catalog).toBeGreaterThan(eligibility);
    expect(observations).toBeGreaterThan(eligibility);
    expect(edge).toContain('.eq("user_id", user.id)');
  });
  it("never opens a write path or publishes an address", () => {
    expect(edge).toContain('acceptsDeposits: false');
    expect(edge).toContain('available: false');
    expect(edge).toContain('verified: false');
    expect(edge).not.toMatch(/\.insert\s*\(|\.update\s*\(|\.upsert\s*\(|\.delete\s*\(/);
    expect(edge).not.toContain("receiver_address");
    expect(edge).not.toContain("private_key");
  });
  it("only makes the roadmap route visible after auth and eligibility", () => {
    expect(preview).toContain("'/DepositNetworks'");
    expect(preview).toContain('user?.is_excluded');
    expect(preview).toContain("currentRoute === '/DepositNetworks'");
    expect(preview.indexOf('user?.is_excluded')).toBeLessThan(preview.indexOf("currentRoute === '/DepositNetworks'"));
  });
});
