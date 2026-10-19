import { requireSupabase } from './supabaseClient';

const isUuid = id => typeof id === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/** Events are staging practice-chip only. Every operation is checked by the Edge Function. */
async function call(action, eventId) {
  if (action !== 'list' && !isUuid(eventId)) throw new Error('Invalid event ID');
  const body = action === 'list' ? { action } : { action, eventId };
  const { data, error } = await requireSupabase().functions.invoke('poker-events-v1', { body });
  if (error || !data || data.error) throw new Error(data?.error || error?.message || 'Poker events unavailable');
  return data;
}
export const practicePokerEvents = Object.freeze({
  list: () => call('list'),
  register: eventId => call('register', eventId),
  tables: eventId => call('tables', eventId),
});
