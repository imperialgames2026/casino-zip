import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const file = (name) => readFileSync(new URL("../supabase/functions/" + name + "/index.ts", import.meta.url), "utf8");

describe("staging Edge source must prevent tester-triggered mutations", () => {
  for (const { name, mutationMarker } of [
    { name: "poker-events-v1", mutationMarker: 'db.rpc("poker_event_register_v1"' },
    { name: "poker-table-v1", mutationMarker: 'db.rpc("poker_create_v1"' },
    { name: "provably-fair-v2", mutationMarker: 'db.from("fair_seed_commitments")' },
  ]) {
    it(name + " checks role from server-side user_roles before a mutation", () => {
      const source = file(name);
      const eligibility = source.indexOf('.from("profiles").select("is_excluded")');
      const roleLookup = source.indexOf('.from("user_roles")');
      const guard = source.indexOf('roleRow?.role==="tester"');
      const mutation = source.indexOf(mutationMarker);
      expect(eligibility).toBeGreaterThan(-1);
      expect(eligibility).toBeLessThan(roleLookup);
      expect(source).toContain('error:"Account ineligible for gameplay"');
      expect(source).toContain('error:"Account role not authorized"');
      expect(roleLookup).toBeGreaterThan(-1);
      expect(guard).toBeGreaterThan(roleLookup);
      expect(mutation).toBeGreaterThan(guard);
      expect(source).toContain('error:"Read-only tester account"');
      expect(source).toContain("auth.auth.getUser(");
    });
  }

  it("keeps KYC document processing disabled without explicit sandbox setup", () => {
    const start = file("kyc-start-v1");
    const webhook = file("kyc-sumsub-webhook");
    for (const source of [start, webhook]) {
      expect(source).toContain("KYC_PROVIDER_READY");
      expect(source).toContain("SUMSUB_SANDBOX_ONLY");
    }
    expect(webhook).toContain("x-payload-digest");
  });
});
