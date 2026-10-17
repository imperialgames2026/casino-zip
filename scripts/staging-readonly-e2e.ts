import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
const email = process.env.STAGING_READONLY_TEST_EMAIL;
const password = process.env.STAGING_READONLY_TEST_PASSWORD;
if (!url || !key || !email || !password) throw new Error('Configure isolated staging read-only Tester credentials in GitHub Actions secrets');

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: auth, error: loginError } = await client.auth.signInWithPassword({ email, password });
if (loginError || !auth.user || !auth.session) throw new Error('Tester authentication failed');

try {
  const uid = auth.user.id;
  const [roles, profiles, wallets] = await Promise.all([
    client.from('user_roles').select('user_id,role'),
    client.from('profiles').select('id,is_excluded').eq('id', uid).single(),
    client.from('wallets').select('id,user_id').eq('user_id', uid),
  ]);
  if (roles.error || profiles.error || wallets.error) throw new Error('Read-only owner access failed');
  if (roles.data?.length !== 1 || roles.data[0].user_id !== uid || roles.data[0].role !== 'tester') {
    throw new Error('Credentials must belong to an isolated read-only tester');
  }
  if (!profiles.data || profiles.data.is_excluded !== false || wallets.data?.some(w => w.user_id !== uid)) {
    throw new Error('Eligibility or wallet ownership mismatch');
  }
  console.log('PASS authenticated tester / canonical role / profile / own wallet');

  async function call(name: string, body: Record<string,unknown>, expected: number) {
    const response = await fetch(url + '/functions/v1/' + name, {
      method: 'POST',
      headers: {
        'authorization': 'Bearer ' + auth.session!.access_token,
        'apikey': key!,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (response.status !== expected) {
      throw new Error(name + ' returned unexpected HTTP status ' + response.status);
    }
    return payload;
  }

  const list = await call('poker-events-v1', { action: 'list' }, 200);
  if (!Array.isArray(list.events)) throw new Error('Practice event list missing');
  console.log('PASS read-only event listing');

  const leaderboard = await call('legacy-leaderboard-v1', { action: 'getWeeklyTokenLeaderboard' }, 200);
  if (leaderboard.success !== true || leaderboard.practiceOnly !== true ||
      leaderboard.currency !== 'CENT' || !Array.isArray(leaderboard.leaderboard)) {
    throw new Error('Practice leaderboard payload invalid');
  }
  for (const player of leaderboard.leaderboard) {
    if (!/^Player [0-9A-F]{8}$/.test(player.name) || player.email ||
        player.rank < 1 || player.rank > 10 || Number(player.total_won) <= 0) {
      throw new Error('Practice leaderboard leaked an identity or invalid win amount');
    }
  }
  console.log('PASS authenticated pseudonymous practice leaderboard');

  // Crypto-deposit work is an explicitly disabled capability catalog; never
  // request a receiving address or initiate payments in read-only CI.
  const catalog = await call('crypto-deposit-preview-v1', { action: 'catalog' }, 200);
  if (catalog.acceptsDeposits !== false || catalog.networks?.length !== 12 ||
      catalog.assets?.length !== 24 ||
      !catalog.networks.every((n: { available: boolean }) => n.available === false) ||
      !catalog.assets.every((a: { available: boolean; verified: boolean }) =>
        a.available === false && a.verified === false)) {
    throw new Error('Crypto capability catalog unexpectedly enabled or incomplete');
  }
  const observations = await call('crypto-deposit-preview-v1', { action: 'observations' }, 200);
  if (observations.acceptsDeposits !== false || !Array.isArray(observations.observations) ||
      observations.observations.some((o: { credit_status: string }) => o.credit_status !== 'not_credited')) {
    throw new Error('Crypto observations unexpectedly credited or unavailable');
  }
  console.log('PASS disabled 12-network crypto catalog and uncredited own observations');

  for (const [name, body] of [
    ['poker-events-v1', { action: 'register', eventId: crypto.randomUUID() }],
    ['poker-table-v1', { action: 'create' }],
    ['provably-fair-v2', { action: 'commit', game: 'dice' }],
  ] as const) {
    const denied = await call(name, body, 403);
    if (denied.error !== 'Read-only tester account') throw new Error('Mutation gate mismatch: ' + name);
    console.log('PASS tester mutation blocked: ' + name);
  }
} finally {
  await client.auth.signOut();
}
console.log('PASS authenticated read-only staging E2E (no changes requested)');
