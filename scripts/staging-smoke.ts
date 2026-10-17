import { createClient } from "@supabase/supabase-js";
import { verifyFairRound } from "../src/lib/fairness";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
const email = process.env.STAGING_TEST_EMAIL;
const password = process.env.STAGING_TEST_PASSWORD;
if (!url || !key || !email || !password) throw new Error("Missing staging smoke-test configuration");
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: auth, error: signInError } = await client.auth.signInWithPassword({ email, password });
if (signInError || !auth.user || !auth.session) throw new Error("Staging sign-in failed: " + (signInError?.message ?? "no session"));
try {
  for (const game of ["dice", "coin", "number"] as const) {
    const { data: commit, error: commitError } = await client.functions.invoke("provably-fair-v2", { body: { action: "commit", game } });
    if (commitError || !commit?.id || !commit.server_seed_hash || commit.phase !== "committed") throw new Error(`Commit failed for ${game}: ${commitError?.message}`);
    if ("serverSeed" in commit || "server_seed" in commit) throw new Error("Secret seed leaked before reveal");
    const clientSeed = crypto.randomUUID();
    const { data: reveal, error: revealError } = await client.functions.invoke("provably-fair-v2", { body: { action: "reveal", roundId: commit.id, clientSeed } });
    if (revealError || !reveal?.serverSeed || reveal.phase !== "revealed") throw new Error(`Reveal failed for ${game}: ${revealError?.message}`);
    if (reveal.roundId !== commit.id || reveal.clientSeed !== clientSeed || reveal.serverSeedHash !== commit.server_seed_hash || reveal.game !== game) throw new Error("Commit/reveal mismatch");
    if (!await verifyFairRound({ game, serverSeed: reveal.serverSeed, clientSeed, nonce: reveal.nonce, serverSeedHash: commit.server_seed_hash, outcome: reveal.outcome })) throw new Error(`Invalid HMAC result for ${game}`);
    const { data: replay, error: replayError } = await client.functions.invoke("provably-fair-v2", { body: { action: "reveal", roundId: commit.id, clientSeed } });
    if (replayError || JSON.stringify(replay.outcome) !== JSON.stringify(reveal.outcome)) throw new Error("Idempotent replay failed");
    console.log(`PASS ${game}: commit, reveal, HMAC verification, replay`);
  }
} finally {
  const { error } = await client.auth.signOut();
  if (error) throw new Error("Staging sign-out failed: " + error.message);
}
console.log("PASS authenticated staging smoke test");
