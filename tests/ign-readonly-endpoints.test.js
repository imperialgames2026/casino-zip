import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const file = (name) => readFileSync(new URL("../supabase/functions/" + name + "/index.ts", import.meta.url), "utf8");
describe("authenticated Edge routes respect read-only testers", () => {
  for (const name of ["poker-events-v1", "poker-table-v1", "provably-fair-v2"]) {
    it(name + " checks canonical Supabase user_roles and rejects tester writes", () => {
      const source = file(name);
      expect(source).toContain('from("user_roles")');
      expect(source).toContain('roleRow?.role==="tester"');
      expect(source).toContain('error:"Read-only tester account"');
      expect(source.indexOf('roleRow?.role==="tester"')).toBeLessThan(source.indexOf('db.rpc('));
    });
  }
  it("keeps real KYC provider endpoints disabled until secrets are configured", () => {
    const start = file("kyc-start-v1");
    const webhook = file("kyc-sumsub-webhook");
    expect(start).toContain('KYC_PROVIDER_READY');
    expect(start).toContain('SUMSUB_SANDBOX_ONLY');
    expect(webhook).toContain("x-payload-digest");
    expect(webhook).toContain("KYC_PROVIDER_READY");
  });
});
