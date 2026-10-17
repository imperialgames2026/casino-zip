// Compatibility import for old pages. This module is backed by Supabase, NOT Base44.
// Every unsupported legacy operation is denied until replaced and tested.
import { requireSupabase } from '@/lib/supabaseClient';
import { currentIdentity } from '@/lib/supabaseIdentity';
import { readOwnWallet, readOwnTransactions, unsupportedLegacyOperation as deny } from '@/lib/supabaseLegacyReads';

const blocked = name => new Proxy({}, {
  get: (_obj, method) => {
    if (typeof method === 'symbol') return undefined;
    return async () => deny(String(name) + '.' + String(method));
  },
});

export const base44 = {
  auth: {
    me: currentIdentity,
    async logout() {
      const { error } = await requireSupabase().auth.signOut();
      if (error) throw error;
      window.location.assign('/');
    },
    redirectToLogin() {
      if (window.location.pathname !== '/') window.location.assign('/');
    },
    async updateMe(patch) {
      if (Object.keys(patch || {}).length !== 1 || !('display_name' in patch)) return deny('Profile update');
      const u = await currentIdentity();
      const { error } = await requireSupabase().from('profiles').update({ display_name: patch.display_name }).eq('id', u.id);
      if (error) throw error;
      return currentIdentity();
    },
  },
  entities: new Proxy({}, {
    get: (_obj, name) => {
      if (typeof name === 'symbol') return undefined;
      if (name === 'UserWallet') return {
        filter: readOwnWallet, list: async () => deny('Wallet list'), get: async () => deny('Wallet lookup'),
        create: async () => deny('Wallet create'), update: async () => deny('Wallet update'),
        delete: async () => deny('Wallet delete'),
      };
      if (name === 'Transaction') return {
        filter: readOwnTransactions, list: async () => deny('Transaction list'),
        create: async () => deny('Transaction create'), update: async () => deny('Transaction update'),
        delete: async () => deny('Transaction delete'),
      };
      return blocked(name);
    },
  }),
  functions: {
    async invoke(name, body = {}) {
      // The legacy UI's weekly readout is now backed by a real, authenticated
      // Supabase aggregate; other legacy functions remain disabled by default.
      if (name === 'getWeeklyTokenLeaderboard') {
        await currentIdentity();
        if (Object.keys(body || {}).length !== 0) return deny('Leaderboard request options');
        const { data, error } = await requireSupabase().functions.invoke('legacy-leaderboard-v1', {
          body: { action: 'getWeeklyTokenLeaderboard' },
        });
        if (error || !data?.success) throw new Error(data?.error || error?.message || 'Practice leaderboard unavailable');
        return { data };
      }
      // Identity allocation no longer guesses a sequential account number or
      // derives a public username from the player's private email address.
      if (name === 'initializeUserIdentity') {
        await currentIdentity();
        return { data: { ok: true, updates: {}, migrated: true } };
      }
      if (name === 'updateUsername') {
        if (typeof body.username !== 'string' || body.username.trim().length < 2 || body.username.trim().length > 40) {
          throw new Error('Invalid display name');
        }
        const user = await base44.auth.updateMe({ display_name: body.username.trim() });
        return { data: { user } };
      }
      return deny('Legacy function ' + String(name));
    },
  },
  integrations: { Core: {
    UploadFile: async () => deny('Legacy upload'),
    InvokeLLM: async () => deny('Legacy AI service'),
  } },
  analytics: { track: () => {} },
  appLogs: { logUserInApp: async () => {} },
};
