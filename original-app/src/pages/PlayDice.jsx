import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Dices, ShieldCheck, RotateCcw } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { requireSupabase } from '@/lib/supabaseClient';
import { verifyFairRound } from '@/lib/fairness';

/**
 * First playable Supabase-migrated casino screen: zero-value practice dice.
 * Wagers, wallet debits/credits, payouts and redeemable balance changes are
 * not implemented; real betting must stay disabled until independently audited.
 */
export default function PlayDice() {
  const { user } = useAuth();
  const isTester = user?.role === 'tester';
  const [rolling, setRolling] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [proof, setProof] = useState(null);
  const [verified, setVerified] = useState(null);

  async function roll() {
    if (rolling || !user || isTester || user.is_excluded) return;
    setRolling(true);
    setError('');
    setProof(null);
    setVerified(null);
    const clientSeed = crypto.randomUUID();
    try {
      const client = requireSupabase();
      setStage('Committing server seed…');
      const { data: committed, error: commitError } = await client.functions.invoke('provably-fair-v2', {
        body: { action: 'commit', game: 'dice' },
      });
      if (commitError || !committed?.id || committed.phase !== 'committed' ||
          !committed.server_seed_hash || 'serverSeed' in committed || 'server_seed' in committed)
        throw new Error('The server commitment could not be verified. No wager was placed.');

      setStage('Revealing practice dice…');
      const { data: revealed, error: revealError } = await client.functions.invoke('provably-fair-v2', {
        body: { action: 'reveal', roundId: committed.id, clientSeed },
      });
      if (revealError || !revealed || revealed.phase !== 'revealed' ||
          revealed.roundId !== committed.id || revealed.clientSeed !== clientSeed ||
          revealed.serverSeedHash !== committed.server_seed_hash || revealed.game !== 'dice')
        throw new Error('The practice round could not be revealed consistently. No wager was placed.');

      const ok = await verifyFairRound({
        game: 'dice',
        serverSeed: revealed.serverSeed,
        serverSeedHash: committed.server_seed_hash,
        clientSeed,
        nonce: revealed.nonce,
        outcome: revealed.outcome,
      });
      if (!ok) throw new Error('Fairness verification failed. The result must not be trusted.');
      if (!Array.isArray(revealed.outcome?.dice) || revealed.outcome.dice.length !== 2)
        throw new Error('Invalid practice dice result');

      setProof({
        id: revealed.roundId,
        dice: revealed.outcome.dice,
        sum: revealed.outcome.sum,
        hash: revealed.serverSeedHash,
        serverSeed: revealed.serverSeed,
        clientSeed,
        nonce: revealed.nonce,
      });
      setVerified(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Practice game unavailable');
      setVerified(false);
    } finally {
      setRolling(false);
      setStage('');
    }
  }

  return <main className="min-h-screen bg-[#0A0612] text-white px-4 py-10">
    <div className="mx-auto max-w-3xl">
      <p className="text-sm uppercase tracking-widest text-pink-400">Imperial Games · Migration Preview</p>
      <h1 className="text-4xl font-black flex items-center gap-3 mt-2 mb-4">
        <Dices className="w-10 h-10 text-pink-400" aria-hidden="true"/> Imperial Practice Dice
      </h1>
      <div role="status" className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-4 mb-6">
        <strong>Practice only — no deposits, wagers, rewards, or withdrawals.</strong>
        <p className="text-gray-300 text-sm mt-2">The result is generated on the Supabase server and independently verified by your browser. Player balances are never used.</p>
      </div>
      <div className="rounded-3xl bg-gradient-to-br from-[#231532] to-[#110F24] border border-pink-500/20 p-8 text-center">
        <p className="text-gray-300 mb-6">Two independently verifiable dice</p>
        <div aria-label="Latest dice values" className="flex justify-center items-center gap-6 mb-6 text-6xl font-black">
          <span className="bg-white/10 rounded-2xl w-24 h-24 flex items-center justify-center">{proof?.dice[0] ?? '?'}</span>
          <span className="bg-white/10 rounded-2xl w-24 h-24 flex items-center justify-center">{proof?.dice[1] ?? '?'}</span>
        </div>
        <p className="text-2xl font-bold mb-5">Total: {proof?.sum ?? '—'}</p>
        {isTester && <p className="text-amber-200 mb-3">Tester accounts are read-only and cannot start game rounds.</p>}
        <button type="button" disabled={rolling || isTester || !user || user?.is_excluded}
          onClick={() => void roll()}
          className="bg-gradient-to-r from-pink-600 to-purple-600 rounded-xl px-8 py-4 font-bold text-lg disabled:opacity-50">
          <RotateCcw className="w-5 h-5 inline mr-2" aria-hidden="true"/>
          {rolling ? stage || 'Generating…' : 'Roll practice dice'}
        </button>
        {error && <p role="alert" className="mt-5 text-red-300">{error}</p>}
        {proof && verified && <div className="mt-7 rounded-xl text-left bg-green-950/25 border border-green-500/30 p-4">
          <p className="font-bold text-green-300 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5"/> SHA-256 commitment and HMAC result verified
          </p>
          <p className="text-sm text-gray-300 mt-3">Server commitment</p>
          <code className="text-xs break-all">{proof.hash}</code>
          <p className="text-sm text-gray-300 mt-3">Revealed seed</p>
          <code className="text-xs break-all">{proof.serverSeed}</code>
          <p className="mt-4 text-sm text-gray-400">Proof saved to your staging practice history. No balance changed.</p>
          <Link to="/ProvablyFair" className="text-green-300 hover:underline mt-2 inline-block">Verify in practice history →</Link>
        </div>}
      </div>
    </div>
  </main>;
}
