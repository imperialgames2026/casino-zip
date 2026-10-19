import { createClient } from '@supabase/supabase-js';

// This is a new adapter for the original casino frontend, not the standalone scaffold.
// Only public client-side credentials belong in VITE_ variables.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && key
  ? createClient(url, key, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } })
  : null;

export function requireSupabase() {
  if (!supabase) throw new Error('Supabase staging configuration is missing. No legacy backend fallback is permitted.');
  return supabase;
}
