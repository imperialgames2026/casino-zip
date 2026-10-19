import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
const email = process.env.STAGING_READONLY_TEST_EMAIL;
const password = process.env.STAGING_READONLY_TEST_PASSWORD;
if (!url || !key || !email || !password) throw new Error('Isolated Tester staging secrets required');

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: auth, error: signInError } = await client.auth.signInWithPassword({ email, password });
if (signInError || !auth.user || !auth.session) throw new Error('Tester sign-in failed');

function deterministicUuid(value: string): Promise<string> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)).then(hash => {
    const bytes = new Uint8Array(hash).slice(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(x => x.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  });
}

async function call(action: string, fields: Record<string, unknown>, expected: number) {
  const response = await fetch(url + '/functions/v1/ig-support-v1', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + auth.session!.access_token,
      apikey: key!,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ action, ...fields }),
  });
  const body = await response.json();
  if (response.status !== expected) {
    throw new Error('Support ' + action + ' returned HTTP ' + response.status +
      (typeof body?.error === 'string' ? ': ' + body.error : ''));
  }
  return body;
}

try {
  const { data: roles, error: roleError } = await client.from('user_roles')
    .select('role').eq('user_id', auth.user.id).single();
  if (roleError || roles?.role !== 'tester') throw new Error('Credentials must belong to read-only Tester');

  // Deterministic request IDs ensure rerunning this manual test does not spam
  // the support queue or bypass its three-open-ticket limit.
  const requestId = await deterministicUuid('imperial-support-staging-open-v1:' + auth.user.id);
  const messageId = await deterministicUuid('imperial-support-staging-message-v1:' + auth.user.id);
  const subject = 'Staging support integration check';
  const body = 'Automated authenticated end-to-end support test; no payments or account changes.';

  const opened = await call('open', { requestId, subject, body }, 200);
  if (typeof opened.id !== 'string') throw new Error('Ticket was not created');
  const repeated = await call('open', { requestId, subject, body }, 200);
  if (repeated.id !== opened.id) throw new Error('Open idempotency failed');
  console.log('PASS idempotent authenticated support ticket opening');

  const posted = await call('post', { ticketId: opened.id, requestId: messageId,
    body: 'Idempotency and player ownership check.' }, 200);
  const postedAgain = await call('post', { ticketId: opened.id, requestId: messageId,
    body: 'Idempotency and player ownership check.' }, 200);
  if (!posted.id || posted.id !== postedAgain.id) throw new Error('Message idempotency failed');
  console.log('PASS idempotent authenticated support reply');

  const mine = await call('mine', {}, 200);
  if (!Array.isArray(mine.tickets) || !mine.tickets.some((x: {id: string}) => x.id === opened.id))
    throw new Error('User cannot read own support ticket');
  const thread = await call('messages', { ticketId: opened.id }, 200);
  if (thread.ticket?.id !== opened.id || !Array.isArray(thread.messages) ||
      thread.messages.length < 2) throw new Error('Support conversation incorrect');
  console.log('PASS player-scoped support conversation retrieval');

  const forbidden = await call('queue', {}, 403);
  if (forbidden.error !== 'Staff role required') throw new Error('Tester gained staff access');
  const forbiddenStatus = await call('status', { ticketId: opened.id, status: 'closed' }, 403);
  if (forbiddenStatus.error !== 'Staff role required') throw new Error('Tester may close tickets');
  console.log('PASS denied staff queue and status mutations for Tester');

  // The authenticated account has already been independently verified as a
  // Tester. The 403 assertion cannot activate exclusion or change balances.
  async function exclusion(action: string, fields: Record<string,unknown>, status: number) {
    const response = await fetch(url + '/functions/v1/ig-self-exclusion-v1', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + auth.session!.access_token,
        apikey: key!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action, ...fields }),
    });
    const json = await response.json();
    if (response.status !== status) throw new Error('Self-exclusion status mismatch ' + response.status);
    return json;
  }
  const exclusionStatus = await exclusion('status', {}, 200);
  if (exclusionStatus.canSelfExclude !== false || exclusionStatus.playerCanReinstate !== false) {
    throw new Error('Tester self-exclusion restrictions missing');
  }
  const forbiddenExclusion = await exclusion('activate', { requestId: crypto.randomUUID() }, 403);
  if (forbiddenExclusion.error !== 'Read-only tester account') {
    throw new Error('Tester was not denied self-exclusion mutation');
  }
  console.log('PASS self-exclusion status and blocked Tester mutation; no account changed');
} finally {
  await client.auth.signOut();
}
console.log('PASS authenticated staging support E2E; no financial actions');
