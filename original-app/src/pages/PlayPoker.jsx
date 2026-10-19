import React, { useCallback, useEffect, useRef, useState } from 'react';
import { practicePoker } from '@/lib/practicePoker';
import { requireSupabase } from '@/lib/supabaseClient';

/** Server-authoritative play-money Hold'em preview. No deposits, payouts, or client settlements. */
export default function PlayPoker() {
  const initialTable = new URLSearchParams(window.location.search).get('tableId') || '';
  const [tableId, setTableId] = useState(initialTable);
  const [joinId, setJoinId] = useState(initialTable);
  const [snapshot, setSnapshot] = useState(null);
  const [status, setStatus] = useState('Ready to create or join a practice table.');
  const [busy, setBusy] = useState(false);
  const [bet, setBet] = useState('');
  const [botLabels, setBotLabels] = useState({});
  const inFlight = useRef(false);
  const refresh = useCallback(async (id = tableId) => {
    if (!id || inFlight.current) return;
    inFlight.current = true;
    try { setSnapshot(await practicePoker.snapshot(id)); }
    catch (e) { setStatus(e.message); }
    finally { inFlight.current = false; }
  }, [tableId]);
  useEffect(() => {
    if (!tableId) return;
    refresh(tableId);
    const timer = setInterval(() => refresh(tableId), 2500);
    return () => clearInterval(timer);
  }, [tableId, refresh]);
  useEffect(() => {
    if (!tableId) { setBotLabels({}); return; }
    let open = true;
    const lookup = async () => {
      const { data, error } = await requireSupabase().functions.invoke('ig-poker-bot-lab', {
        body: { action: 'roster', tableId },
      });
      if (!open) return;
      if (error || data?.practiceOnly !== true || !Array.isArray(data.bots)) {
        setBotLabels({});
        return;
      }
      setBotLabels(Object.fromEntries(data.bots.map(bot => [bot.seatNo, bot.name])));
    };
    void lookup();
    return () => { open = false; };
  }, [tableId, snapshot?.seats?.length]);
  async function run(task) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await task();
      if (result?.tableId) {
        setTableId(result.tableId);
        setJoinId(result.tableId);
        window.history.replaceState(null, '', '/PlayPoker?tableId=' + encodeURIComponent(result.tableId));
      }
      setStatus('Request accepted by the practice poker server.');
      if (result?.tableId || tableId) await refresh(result?.tableId || tableId);
    } catch (e) { setStatus(e.message || 'Request failed'); }
    finally { setBusy(false); }
  }
  const t = snapshot?.table;
  const seats = snapshot?.seats || [];
  const cards = snapshot?.holeCards || [];
  const seatCount = seats.length;
  async function act(move) {
    const amount = ['bet', 'raise'].includes(move) ? Number(bet) : 0;
    if (!Number.isSafeInteger(amount) || amount < 0) { setStatus('Enter a nonnegative whole-chip target.'); return; }
    await run(() => practicePoker.act({
      tableId, actionId: crypto.randomUUID(), expectedVersion: t.version, move, amount
    }));
  }
  return <main className="min-h-screen bg-[#0A1019] text-white p-4 md:p-8">
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-3xl font-black">Imperial Poker ♠</h1>
          <p className="text-amber-300 text-sm">Practice chips only · Supabase-authoritative table · no cash value</p></div>
        <button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-3 disabled:opacity-50"
          onClick={() => run(() => practicePoker.create())}>Create practice table</button>
      </div>
      <section className="bg-slate-800 rounded-xl p-4 flex flex-wrap gap-2">
        <input aria-label="Table ID" className="bg-slate-900 border border-slate-600 rounded px-3 py-2 flex-1 min-w-48"
          value={joinId} onChange={e => setJoinId(e.target.value.trim())} placeholder="Paste a table UUID to join" />
        <button disabled={busy || !joinId} onClick={() => run(async () => { const response = await practicePoker.join(joinId); return {...response, tableId: joinId}; })}
          className="bg-emerald-700 disabled:opacity-50 rounded px-4 py-2">Join table</button>
        <button disabled={busy || !tableId} onClick={() => refresh()} className="bg-slate-600 rounded px-4 py-2">Refresh</button>
      </section>
      <div role="status" aria-live="polite" className="text-sm text-slate-300">{status}</div>
      {t && <section className="rounded-[3rem] border-[12px] border-[#6e4022] bg-gradient-to-b from-emerald-800 to-emerald-950 p-6 md:p-10 text-center shadow-2xl">
        <div className="mb-4 text-sm uppercase tracking-widest text-emerald-200">
          {t.status} · {t.street} · Hand {t.handNo} · {seatCount} seated
        </div>
        <div className="flex justify-center gap-2 min-h-20 items-center">
          {(t.board || []).map((card, i) => <span key={i} className="rounded bg-white text-black text-xl px-3 py-4">
            {typeof card === 'string' ? card : (card.rank + card.suit)}</span>)}
        </div>
        <p className="my-2 text-sm text-emerald-200">Acting seat: {t.turnIndex ?? 'none'} · Blind {t.smallBlind}/{t.bigBlind} · State version {t.version}</p>
        <p className="my-5 text-2xl font-bold">Practice Pot: {seats.reduce((a, s) => a + (Number(s.committed) || 0), 0)} chips</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {seats.map(s => <div key={s.seat_no} className="bg-black/30 rounded-xl p-3 text-left">
            <p className="font-semibold">{botLabels[s.seat_no] || 'Seat '+s.seat_no} {s.folded ? '(folded)' : s.all_in ? '(all-in)' : ''}</p>
            <p className="text-sm text-emerald-200">{s.stack} chips · bet {s.street_bet}</p>
          </div>)}
        </div>
        <p className="mt-5 text-sm">Your cards: {cards.map(c => typeof c === 'string' ? c : c.rank + c.suit).join('  ') || 'Not dealt'}</p>
        {t.deckCommitment && <p className="mt-2 break-all text-xs text-emerald-300">Deck commitment: {t.deckCommitment}</p>}
      </section>}
      {t && <section className="bg-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <button className="bg-purple-700 px-4 py-3 rounded disabled:opacity-50" disabled={busy}
            onClick={() => run(() => practicePoker.start(tableId))}>Start hand (owner)</button>
          <label className="text-sm">Total bet/raise target
            <input aria-label="Bet or raise target" type="number" min="0" step="1" value={bet}
              onChange={e => setBet(e.target.value)} className="block bg-slate-950 rounded p-2 w-40" /></label>
        </div>
        {t.status === 'showdown' && <div className="flex flex-wrap gap-2">
          {t.street !== 'river' && <button disabled={busy} onClick={() => run(() => practicePoker.advance(tableId))}
            className="bg-indigo-700 px-4 py-3 rounded">Deal next street</button>}
          {t.street === 'river' && <button disabled={busy} onClick={() => run(() => practicePoker.settle(tableId))}
            className="bg-amber-700 px-4 py-3 rounded">Resolve showdown</button>}
        </div>}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {['fold', 'check', 'call', 'bet', 'raise', 'allin'].map(move =>
            <button key={move} disabled={busy || t.status !== 'playing'} onClick={() => act(move)}
              className="capitalize bg-emerald-700 disabled:bg-slate-700 disabled:text-slate-400 p-3 rounded">{move}</button>)}
        </div>
        <p className="text-xs text-slate-400">Moves are validated by the server against seat membership, turn and table revision. Reconnect by reopening this table URL.</p>
      </section>}
    </div>
  </main>;
}
