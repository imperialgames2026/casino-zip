import React, { useCallback, useEffect, useState } from 'react';
import { requireSupabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

/**
 * Real support tickets backed by Supabase; does not invoke the Base44 LLM
 * integration or promise an AI-generated answer that doesn't exist.
 */
export default function Support() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const invoke = useCallback(async (action, fields = {}) => {
    const { data, error: fnError } = await requireSupabase().functions.invoke('ig-support-v1', {
      body: { action, ...fields },
    });
    if (fnError || data?.error) throw new Error(data?.error || fnError?.message || 'Support request failed');
    return data;
  }, []);

  const reload = useCallback(async () => {
    const data = await invoke('mine');
    setTickets(Array.isArray(data?.tickets) ? data.tickets : []);
  }, [invoke]);

  const openConversation = useCallback(async (id) => {
    if (!id) return;
    const data = await invoke('messages', { ticketId: id });
    setConversation(data);
    setActiveId(id);
  }, [invoke]);

  useEffect(() => {
    if (!user) return;
    let current = true;
    invoke('mine')
      .then(data => { if (current) setTickets(Array.isArray(data?.tickets) ? data.tickets : []); })
      .catch(err => { if (current) setError(err.message); });
    return () => { current = false; };
  }, [user?.id, invoke]);

  async function createTicket(event) {
    event.preventDefault();
    if (busy || !subject.trim() || !message.trim()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const data = await invoke('open', {
        subject: subject.trim(), body: message.trim(), requestId: crypto.randomUUID(),
      });
      setSubject('');
      setMessage('');
      await reload();
      await openConversation(data.id);
      setNotice('Support ticket opened. Your message is safely recorded.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function reply(event) {
    event.preventDefault();
    if (!activeId || !message.trim() || busy || conversation?.ticket?.status === 'closed') return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await invoke('post', {
        ticketId: activeId, body: message.trim(), requestId: crypto.randomUUID(),
      });
      setMessage('');
      await openConversation(activeId);
      await reload();
      setNotice('Reply saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return <main className="min-h-screen bg-[#0A0612] text-white px-4 py-10">
    <div className="mx-auto max-w-5xl">
      <p className="text-sm tracking-widest uppercase text-pink-400">Imperial Games</p>
      <h1 className="text-4xl font-black mb-2">Support Center</h1>
      <p className="text-gray-400 mb-8">Send a message to the Imperial Games support team. No AI service or payment-processing action is connected.</p>
      {error && <p role="alert" className="mb-5 rounded-lg border border-red-500/40 bg-red-950/40 p-4">{error}</p>}
      {notice && <p role="status" className="mb-5 rounded-lg border border-green-500/40 bg-green-950/30 p-4">{notice}</p>}
      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <aside className="rounded-2xl border border-white/10 bg-[#191329] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">Your requests</h2>
            <button type="button" className="text-pink-300 hover:text-pink-200"
              onClick={() => { setActiveId(null); setConversation(null); setMessage(''); }}>New</button>
          </div>
          {tickets.length === 0 && <p className="text-gray-400 text-sm">No support requests yet.</p>}
          <div className="space-y-3">
            {tickets.map(ticket =>
              <button key={ticket.id} type="button" onClick={() => {
                void openConversation(ticket.id).catch(err => setError(err.message));
              }} className={'w-full rounded-lg border p-3 text-left ' +
                (activeId === ticket.id ? 'border-pink-400 bg-pink-500/10' : 'border-white/10 bg-white/5')}>
                <span className="block font-medium break-words">{ticket.subject}</span>
                <span className="text-sm text-gray-400 capitalize">{ticket.status?.replace('_', ' ')}</span>
              </button>
            )}
          </div>
        </aside>
        <section className="rounded-2xl border border-white/10 bg-[#191329] p-5">
          {conversation ? <>
            <div className="flex justify-between gap-3 flex-wrap border-b border-white/10 pb-4 mb-5">
              <h2 className="text-xl font-bold">{conversation.ticket.subject}</h2>
              <span className="text-pink-300 capitalize">{conversation.ticket.status.replace('_',' ')}</span>
            </div>
            <div aria-label="Support conversation" className="space-y-3 mb-5">
              {(conversation.messages || []).map(m => <div key={m.id}
                className={'rounded-lg p-3 ' + (m.sender_kind === 'staff' ? 'bg-indigo-900/50' : 'bg-white/5')}>
                <span className="block text-xs font-bold text-pink-300 mb-1">{m.sender_kind === 'staff' ? 'Imperial Games support' : 'You'}</span>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <time className="text-xs text-gray-400">{new Date(m.created_at).toLocaleString()}</time>
              </div>)}
            </div>
          </> : <h2 className="text-xl font-bold mb-4">Open a new support ticket</h2>}
          {conversation?.ticket?.status === 'closed'
            ? <p className="text-amber-300">This conversation is closed. Open a new request for further assistance.</p>
            : <form onSubmit={conversation ? reply : createTicket} className="space-y-4">
              {!conversation && <label className="block">Subject
                <input aria-label="Support subject" required minLength={3} maxLength={120}
                  value={subject} onChange={e => setSubject(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-black/30 border border-white/20 p-3" />
              </label>}
              <label className="block">{conversation ? 'Your reply' : 'Describe the problem'}
                <textarea aria-label="Support message" required minLength={1} maxLength={2000}
                  value={message} onChange={e => setMessage(e.target.value)}
                  rows={5} className="mt-1 w-full rounded-lg bg-black/30 border border-white/20 p-3"/>
              </label>
              <button disabled={busy || !user} type="submit"
                className="rounded-lg bg-pink-600 hover:bg-pink-500 disabled:opacity-50 px-6 py-3 font-bold">
                {busy ? 'Saving…' : conversation ? 'Send reply' : 'Open support ticket'}
              </button>
            </form>}
          <p className="text-sm text-gray-400 mt-4">
            Never send private keys, recovery phrases, or payment card details in support messages.
          </p>
        </section>
      </div>
    </div>
  </main>;
}
