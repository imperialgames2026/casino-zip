import React, { useState } from 'react';
import { requireSupabase } from '@/lib/supabaseClient';

export default function SupabaseSignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  async function signIn(event) {
    event.preventDefault();
    setWorking(true);
    setError('');
    try {
      const { error: authError } = await requireSupabase().auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      // The Supabase auth listener refreshes account roles and eligibility.
    } catch (e) {
      setError(e.message || 'Unable to sign in');
    } finally {
      setWorking(false);
    }
  }

  return <main style={{ minHeight: '100vh', background: '#0e1020', color: '#f5d98a', display: 'grid', placeItems: 'center', padding: 20 }}>
    <form onSubmit={signIn} style={{ display: 'grid', gap: 14, width: 'min(100%, 400px)', padding: 30, border: '1px solid #bba065', borderRadius: 16 }}>
      <h1>Imperial Games · Staging sign-in</h1>
      <p>Supabase account required. Transactions and gaming functions remain disabled during migration.</p>
      <label>Email<input aria-label="Email" required type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} style={{ display: 'block', width: '100%', padding: 10 }}/></label>
      <label>Password<input aria-label="Password" required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} style={{ display: 'block', width: '100%', padding: 10 }}/></label>
      <button type="submit" disabled={working}>{working ? 'Signing in...' : 'Sign in'}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  </main>;
}
