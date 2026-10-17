export type FairGame = "dice" | "coin" | "number";
export type FairOutcome = { dice: number[]; sum: number } | { coin: "heads" | "tails" } | { number: number };
const encoder = new TextEncoder();
const toHex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");

export async function verifyFairRound(input: {
  game: FairGame;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  serverSeedHash: string;
  outcome: FairOutcome;
}): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(input.serverSeedHash) || !Number.isSafeInteger(input.nonce) || input.nonce < 0) return false;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(input.serverSeed)));
  if (toHex(digest) !== input.serverSeedHash) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(input.serverSeed), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const numbers: number[] = [];
  const count = input.game === "dice" ? 2 : 1;
  let counter = 0;
  while (numbers.length < count) {
    const bytes = new DataView(await crypto.subtle.sign("HMAC", key, encoder.encode(`${input.clientSeed}:${input.nonce}:${counter++}`)));
    for (let i = 0; i <= 28 && numbers.length < count; i += 4) {
      const n = bytes.getUint32(i, false);
      if (n < 4294967292) numbers.push(n % 6 + 1);
    }
  }
  const expected: FairOutcome = input.game === "dice"
    ? { dice: numbers, sum: numbers[0] + numbers[1] }
    : input.game === "coin"
      ? { coin: numbers[0] % 2 ? "heads" : "tails" }
      : { number: numbers[0] };
  return JSON.stringify(expected) === JSON.stringify(input.outcome);
}
