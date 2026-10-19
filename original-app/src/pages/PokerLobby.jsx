import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { practicePoker } from '@/lib/practicePoker';
import { practicePokerEvents } from '@/lib/practicePokerEvents';
import { useAuth } from '@/lib/AuthContext';

/** Practice-only multiplayer poker lobby. Real-money buy-ins and legacy client wallets are disabled. */
export default function PokerLobby() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [joinId, setJoinId] = useState('');

  const refresh = useCallback(async () => {
    try {
      const result = await practicePokerEvents.list();
      setEvents(Array.isArray(result.events) ? result.events : []);
      setMessage('');
    } catch (e) { setMessage(e.message || 'Unable to load poker events.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function perform(task) {
    if (working) return;
    setWorking(true);
    try { await task(); }
    catch (e) { setMessage(e.message || 'Poker request failed.'); }
    finally { setWorking(false); }
  }
  const tableUrl = id => '/PlayPoker?tableId=' + encodeURIComponent(id);
  return <main className="min-h-screen bg-[#0A1019] text-white p-4 md:p-8">
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Imperial Poker Lobby ♠</h1>
          <p className="text-amber-300">Supabase practice chips only · no deposits, entry fees, prizes, or cash-outs</p>
        </div>
        <button type="button" disabled={working} onClick={() => perform(async () => {
          const created = await practicePoker.create();
          if (!created.tableId) throw new Error('Poker server did not create a table.');
          navigate(tableUrl(created.tableId));
        })} className="bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 rounded-xl px-5 py-3">
          Create practice table
        </button>
      </header>

      {user?.role === 'superadmin' && <Link to="/PokerBotLab"
        className="inline-block mb-5 rounded-xl border border-amber-400/50 bg-amber-500/10 px-5 py-3 font-bold text-amber-200">
        🤖 AI Poker Test Lab · Superadmin
      </Link>}
      <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl flex flex-wrap gap-3">
        <label className="flex-1 min-w-52 text-sm">Join a friend's practice table
          <input aria-label="Friend's table ID" value={joinId} onChange={e => setJoinId(e.target.value.trim())}
            placeholder="Paste table UUID" className="block mt-2 p-3 rounded-lg w-full bg-slate-950 border border-slate-700 text-white" />
        </label>
        <button type="button" disabled={working || !/^[0-9a-f-]{36}$/i.test(joinId)}
          onClick={() => navigate(tableUrl(joinId))}
          className="self-end px-5 py-3 rounded-lg bg-emerald-700 disabled:opacity-50">Open table</button>
      </div>

      {message && <div role="alert" className="bg-rose-950 border border-rose-700 p-3 rounded-lg">{message}</div>}
      <section className="bg-slate-800/60 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Practice tournaments and Sit & Go</h2>
          <button onClick={refresh} disabled={loading || working} className="text-indigo-300 underline disabled:opacity-50">Refresh</button>
        </div>
        {loading ? <p>Loading events…</p> : events.length === 0 ? <p className="text-slate-300">
          No staging events currently available. Create a private practice table above to play with friends.
        </p> : <div className="grid md:grid-cols-2 gap-4">
          {events.map(event => <article key={event.id} className="rounded-xl bg-slate-900 border border-slate-700 p-4 space-y-3">
            <div className="flex justify-between gap-2">
              <h3 className="font-bold text-lg">{event.name || 'Poker event'}</h3>
              <span className="text-indigo-300 text-sm">{event.status}</span>
            </div>
            <p className="text-sm text-slate-300">{event.format || 'Tournament'} · {event.registered ?? 0}/{event.maxPlayers ?? '?'} registered</p>
            <p className="text-sm text-slate-300">Practice starting stack: {event.startingStack ?? 'configured by host'} · Blinds {event.smallBlind ?? '?'}/{event.bigBlind ?? '?'}</p>
            <div className="flex flex-wrap gap-2">
              {event.status === 'registration' && !event.myEntry &&
                <button type="button" disabled={working} onClick={() => perform(async () => {
                  await practicePokerEvents.register(event.id);
                  await refresh();
                })} className="px-4 py-2 rounded bg-emerald-700 disabled:opacity-50">Register free</button>}
              {event.myEntry && <button type="button" disabled={working} onClick={() => perform(async () => {
                const result = await practicePokerEvents.tables(event.id);
                if (!result.myTableId) throw new Error('You are registered; seating has not started.');
                navigate(tableUrl(result.myTableId));
              })} className="px-4 py-2 rounded bg-indigo-700 disabled:opacity-50">Open my table</button>}
              {event.myEntry && <span className="text-xs text-emerald-300 self-center">Registered · {event.myEntry.status}</span>}
            </div>
          </article>)}
        </div>}
      </section>
      <p className="text-sm text-slate-400">
        Games and tournaments are testing-only until multiplayer, fairness, compliance and custody audits pass.
        <Link to="/Home" className="ml-2 underline text-indigo-300">Return to home</Link>
      </p>
    </div>
  </main>;
}
