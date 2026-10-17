import { describe, expect, it } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { verifyFairRound } from "./fairness";
import type { FairOutcome } from "./fairness";

function reference(seed: string, clientSeed: string, nonce: number, game: "dice" | "coin" | "number"): FairOutcome {
  const values: number[] = [];
  let counter = 0;
  while (values.length < (game === "dice" ? 2 : 1)) {
    const digest = createHmac("sha256", seed).update(`${clientSeed}:${nonce}:${counter++}`).digest();
    for (let i = 0; i <= 28 && values.length < (game === "dice" ? 2 : 1); i += 4) {
      const n = digest.readUInt32BE(i);
      if (n < 4294967292) values.push(n % 6 + 1);
    }
  }
  return game === "dice" ? { dice: values, sum: values[0] + values[1] } : game === "coin" ? { coin: values[0] % 2 ? "heads" as const : "tails" as const } : { number: values[0] };
}
describe("provably fair verifier", () => {
  const serverSeed = "0123456789abcdef".repeat(4);
  const clientSeed = "client-chosen-seed";
  const serverSeedHash = createHash("sha256").update(serverSeed).digest("hex");
  for (const game of ["dice", "coin", "number"] as const) {
    it(`verifies an independently calculated ${game} outcome`, async () => {
      const outcome = reference(serverSeed, clientSeed, 4, game);
      expect(await verifyFairRound({ game, serverSeed, clientSeed, nonce: 4, serverSeedHash, outcome })).toBe(true);
    });
    it(`rejects a tampered ${game} result`, async () => {
      expect(await verifyFairRound({ game, serverSeed, clientSeed, nonce: 4, serverSeedHash, outcome: { number: 999 } })).toBe(false);
    });
  }
  it("rejects incorrect commitment", async () => {
    expect(await verifyFairRound({ game: "number", serverSeed, clientSeed, nonce: 4, serverSeedHash: "0".repeat(64), outcome: reference(serverSeed, clientSeed, 4, "number") })).toBe(false);
  });
});
