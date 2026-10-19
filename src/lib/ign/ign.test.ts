import { describe, expect, it } from "vitest";
import { IGN_ALLOCATION, IGN_ATOMIC_SUPPLY, IGN_DEVNET } from "./asset-registry";
import { atomicToTokenString, integerTokenString } from "./format-token-units";
import { mayReadRoyalTreasury } from "./treasury-access";

describe("IGN allocation / custody invariants", () => {
  it("adds to exactly 100% and exactly 10 billion without float rounding", () => {
    expect(IGN_ALLOCATION.reduce((sum, row) => sum + row.percent, 0)).toBe(100);
    expect(IGN_ALLOCATION.reduce((sum, row) => sum + row.amount, 0n)).toBe(IGN_DEVNET.nominalSupply);
    expect(IGN_DEVNET.nominalSupply * 10n ** BigInt(IGN_DEVNET.decimals)).toBe(IGN_ATOMIC_SUPPLY);
  });
  it("never routes to a Mainnet mint", () => {
    expect(IGN_DEVNET.network).toBe("devnet");
    expect(IGN_DEVNET.rpcUrl).toBe("https://api.devnet.solana.com");
    expect(IGN_DEVNET.explorer).toContain("cluster=devnet");
    expect(IGN_DEVNET.mint).toBe("CQpbojFzQJfcEjXJYRHSg4bnTheGKDJtEgPxQZLdivvz");
  });
  it("formats 64-bit SPL amounts exactly as BigInt", () => {
    expect(atomicToTokenString(IGN_ATOMIC_SUPPLY)).toBe("10,000,000,000");
    expect(atomicToTokenString("1234567890123456789")).toBe("1,234,567,890.123456789");
    expect(atomicToTokenString(1n)).toBe("0.000000001");
    expect(atomicToTokenString(0n)).toBe("0");
    expect(integerTokenString(IGN_DEVNET.nominalSupply)).toBe("10,000,000,000");
  });
  it("denies all roles other than explicit Superadmin", () => {
    for (const role of [null, undefined, "", "player", "tester", "admin", "SUPERADMIN"]) {
      expect(mayReadRoyalTreasury(role)).toBe(false);
    }
    expect(mayReadRoyalTreasury("superadmin")).toBe(true);
  });
});
