import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { currentIdentity } from '@/lib/supabaseIdentity';

const Context = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setLoading] = useState(true);
  const [authChecked, setChecked] = useState(false);
  const [authError, setError] = useState(null);

  const checkUserAuth = useCallback(async () => {
    setLoading(true);
    try {
      const identity = await currentIdentity();
      setUser(identity);
      setError(null);
    } catch (err) {
      setUser(null);
      setError({ type: !supabase ? 'configuration_required' : err.message === 'Authentication required' ? 'auth_required' : 'account_unverified', message: err.message });
    } finally {
      setChecked(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkUserAuth();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => { void checkUserAuth(); }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, [checkUserAuth]);

  async function logout() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }
  return <Context.Provider value={{
    user, isAuthenticated: !!user, isLoadingAuth, isLoadingPublicSettings: false,
    authChecked, authError, appPublicSettings: null,
    checkUserAuth, checkAppState: checkUserAuth, logout,
    navigateToLogin: () => { if (window.location.pathname !== '/') window.location.assign('/'); },
  }}>{children}</Context.Provider>;
}

export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('AuthProvider missing');
  return value;
}
