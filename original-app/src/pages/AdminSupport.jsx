import React, { useCallback, useEffect, useState } from 'react';
import { requireSupabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

// Staff-only queue backed by server-checked Supabase roles, not client email.
export default function AdminSupport() {
  const { user } = useAuth();
  const isStaff = user?.role === 'admin' || user?.role === 'superadmin';
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [conversation, setConversation] = useState(null);
  const [replyBody, setReplyBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const invoke = useCallback(async (action, fields = {}) => {
    const { data, error: invokeError } = await requireSupabase().functions.invoke('ig-support-v1', {
      body: { action, ...fields },
    });
    if (invokeError || data?.error) throw new Error(data?.error || invokeError?.message || 'Support service unavailable');
    return data;
  }, []);

  const reload = useCallback(async () => {
    const data = await invoke('queue');
    setTickets(Array.isArray(data.tickets) ? data.tickets : []);
  }, [invoke]);

  const choose = useCallback(async id => {
    const result = await invoke('messages', { ticketId: id });
    setConversation(result);
    setSelectedId(id);
  }, [invoke]);

  useEffect(() => {
    if (!isStaff) return;
    let active = true;
    invoke('queue').then(d => { if (active) setTickets(d.tickets || []); })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [isStaff, invoke]);

  async function send(event) {
    event.preventDefault();
    if (!replyBody.trim() || !selectedId || busy) return;
    setBusy(true);
    setError('');
    try {
      await invoke('post', {
        ticketId: selectedId, body: replyBody.trim(), requestId: crypto.randomUUID(),
      });
      setReplyBody('');
      await Promise.all([reload(),choose(selectedId)]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status) {
    if (!selectedId || busy) return;
    setBusy(true);
    setError('');
    try {
      await invoke('status', { ticketId: selectedId, status });
      await Promise.all([reload(), choose(selectedId)]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!isStaff) return <main className="bg-[#0A0612] text-white p-10 min-h-screen" role="alert">
    Admin or Superadmin authorization required.
  </main>;

  return <main className="bg-[#0A0612] text-white min-h-screen p-6">
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-extrabold mb-2">Imperial Games · Support Queue</h1>
      <p className="text-gray-400 mb-8">Authenticated customer support. Do not ask for recovery phrases or payment secrets.</p>
      {error && <div role="alert" className="mb-4 border border-red-500 rounded-lg p-3">{error}</div>}
      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <aside className="rounded-xl border border-white/10 bg-[#1A1528] p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold">Recent requests</h2>
            <button onClick={() => void reload().catch(e => setError(e.message))}
              className="text-pink-300 hover:text-pink-100">Refresh</button>
          </div>
          <div className="space-y-2">
            {tickets.length === 0 && <p className="text-gray-400">No tickets in the queue.</p>}
            {tickets.map(ticket => <button key={ticket.id} type="button"
              className={'w-full p-3 rounded-lg text-left border ' +
                (selectedId === ticket.id ? 'border-pink-400 bg-pink-500/10' : 'border-white/10 bg-white/5')}
              onClick={() => void choose(ticket.id).catch(e => setError(e.message))}>
              <span className="block font-semibold">{ticket.subject}</span>
              <span className="text-xs text-gray-400">#{ticket.id.slice(0,8)} · {ticket.status.replace('_',' ')}</span>
            </button>)}
          </div>
        </aside>
        <section className="rounded-xl border border-white/10 bg-[#1A1528] p-5">
          {!conversation ? <p className="text-gray-400">Choose a ticket to view its messages.</p> : <>
            <h2 className="text-xl font-bold mb-2">{conversation.ticket.subject}</h2>
            <p className="text-sm text-gray-400 mb-4">Status: {conversation.ticket.status}</p>
            <div className="flex flex-wrap gap-2 mb-5">
              <button disabled={busy} onClick={() => void setStatus('in_progress')}
                className="bg-indigo-600 px-3 py-2 rounded-lg disabled:opacity-50">Claim / In progress</button>
              <button disabled={busy} onClick={() => void setStatus('closed')}
                className="bg-gray-700 px-3 py-2 rounded-lg disabled:opacity-50">Close ticket</button>
              <button disabled={busy} onClick={() => void setStatus('open')}
                className="border border-gray-500 px-3 py-2 rounded-lg disabled:opacity-50">Reopen</button>
            </div>
            <div className="space-y-3 mb-5">
              {(conversation.messages || []).map(m => <div key={m.id}
                className={'p-4 rounded-xl border ' + (m.sender_kind === 'staff' ?
                  'border-indigo-500/30 bg-indigo-950/40' : 'border-white/10 bg-white/5')}>
                <span className="text-xs text-pink-300 font-semibold">{m.sender_kind === 'staff' ? 'Support team' : 'Player'}</span>
                <p className="whitespace-pre-wrap break-words mt-1">{m.body}</p>
                <time className="text-xs text-gray-500">{new Date(m.created_at).toLocaleString()}</time>
              </div>)}
            </div>
            {conversation.ticket.status !== 'closed' && <form onSubmit={send}>
              <label className="block mb-2">Your reply
                <textarea required minLength={1} maxLength={2000} rows={4}
                  value={replyBody} onChange={e => setReplyBody(e.target.value)}
                  className="w-full mt-2 p-3 rounded-lg bg-black/30 border border-white/20"/>
              </label>
              <button type="submit" disabled={busy} className="px-5 py-3 rounded-lg bg-pink-600 disabled:opacity-50">
                {busy ? 'Saving…' : 'Send staff reply'}
              </button>
            </form>}
          </>}
        </section>
      </div>
    </div>
  </main>;
}
