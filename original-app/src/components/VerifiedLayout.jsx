import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { readOwnWallet } from '@/lib/supabaseLegacyReads';
import { Home, Gamepad2, UserRound, ShieldCheck, Headphones, Wallet, LogOut, BarChart3, Trophy, History, BadgeCheck, Menu, X } from 'lucide-react';

// This is the single shared layout used by approved migration routes.
// It never mounts old Base44 referral, payment, wallet-gift, chat or KYC widgets.
const nav = [
  { path: '/Home', label: 'Home', icon: Home },
  { path: '/Games', label: 'Games', icon: Gamepad2 },
  { path: '/PokerLobby', label: 'Practice Poker', icon: Gamepad2 },
  { path: '/ProfileStats', label: 'Stats', icon: BarChart3 },
  { path: '/Leaderboard', label: 'Leaderboard', icon: Trophy },
  { path: '/Profile', label: 'Profile', icon: UserRound },
  { path: '/TransactionHistory', label: 'History', icon: History },
  { path: '/KYCVerification', label: 'Verification', icon: BadgeCheck },
  { path: '/ProvablyFair', label: 'Fairness', icon: ShieldCheck },
  { path: '/Support', label: 'Support', icon: Headphones },
];
const currencyOptions = [
  { key: 'practice', label: 'Practice chips', field: 'cent_balance' },
  { key: 'igd', label: 'IGD test', field: 'igd_balance' },
  { key: 'igt', label: 'IGT test', field: 'igt_balance' },
];

export default function VerifiedLayout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [currency, setCurrency] = useState('practice');
  const [menu, setMenu] = useState(false);
  const [exitError, setExitError] = useState('');
  const walletRead = useQuery({
    queryKey: ['layout-verified-own-wallet', user?.id],
    queryFn: () => readOwnWallet({ user_email: user.email }),
    enabled: Boolean(user?.id),
    staleTime: 30_000,
    retry: 1,
  });
  const wallet = walletRead.data?.[0];
  const currentCurrency = currencyOptions.find(v => v.key === currency) || currencyOptions[0];
  const balance = wallet ? wallet[currentCurrency.field] : null;
  const number = balance == null ? '—' : String(balance);

  async function signOut() {
    setExitError('');
    try { await logout(); window.location.assign('/'); }
    catch (error) { setExitError(error instanceof Error ? error.message : 'Sign-out unavailable'); }
  }

  return <div className="min-h-screen bg-[#0A0612] text-white">
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0A0612]/95 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap gap-3 items-center justify-between">
        <Link to="/Home" className="inline-flex gap-3 items-center min-w-0">
          <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center text-2xl rounded-xl bg-gradient-to-br from-[#c7924b] to-[#e7c876] text-[#211321]">♛</span>
          <span className="font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-pink-400">IMPERIAL GAMES</span>
        </Link>
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-gray-400" htmlFor="verified-wallet-currency">Display</label>
          <select id="verified-wallet-currency" value={currency} onChange={event => setCurrency(event.target.value)}
            className="bg-[#211a2f] text-white border border-amber-500/30 rounded-lg p-2 text-xs max-w-[135px]">
            {currencyOptions.map(item => <option value={item.key} key={item.key}>{item.label}</option>)}
          </select>
          <span title="Read-only staging balance; not cashable or transferable" className="text-amber-200 text-sm font-bold font-mono">
            {walletRead.isLoading ? '…' : walletRead.error ? 'N/A' : number}
          </span>
          <button type="button" onClick={() => setMenu(value => !value)} aria-label={menu ? 'Close navigation' : 'Open navigation'}
            aria-expanded={menu} className="md:hidden rounded-lg border border-white/15 p-2">
            {menu ? <X size={20}/> : <Menu size={20}/>}
          </button>
        </div>
      </div>
      <nav aria-label="Imperial Games navigation"
        className={(menu ? 'flex ' : 'hidden ') + 'md:flex flex-wrap max-w-7xl mx-auto px-3 pb-2 gap-1'}>
        {nav.map(item => <Link key={item.path} to={item.path} onClick={() => setMenu(false)}
          aria-current={location.pathname === item.path ? 'page' : undefined}
          className={'rounded-lg text-sm flex items-center gap-2 px-3 py-2 transition-colors ' +
            (location.pathname === item.path ? 'bg-amber-400/20 text-amber-200' : 'text-gray-300 hover:bg-white/10 hover:text-white')}>
          <item.icon size={16}/>{item.label}
        </Link>)}
        {user?.role === 'superadmin' && <Link to="/AdminUsers" onClick={() => setMenu(false)} className="rounded-lg text-sm px-3 py-2 text-amber-200 hover:bg-white/10">
          User directory
        </Link>}
        {['admin', 'superadmin'].includes(user?.role) && <Link to="/AdminSupport" onClick={() => setMenu(false)} className="rounded-lg text-sm px-3 py-2 text-gray-300 hover:bg-white/10">
          Staff support
        </Link>}
        <button type="button" onClick={() => void signOut()} className="flex items-center gap-2 rounded-lg text-sm px-3 py-2 text-gray-300 hover:bg-white/10">
          <LogOut size={16}/> Sign out
        </button>
      </nav>
      {exitError && <p role="alert" className="text-sm text-rose-300 text-center pb-2">{exitError}</p>}
    </header>
    <div role="status" className="border-b border-amber-500/10 text-center px-3 py-1 text-xs bg-[#1a1421] text-amber-100">
      Supabase staging · read-only wallet indicators · no real funds, deposits, purchases, payouts or redeemable prizes
    </div>
    {children}
    <footer className="border-t border-white/10 text-gray-500 text-xs px-4 py-7 text-center">
      Imperial Games migration preview. Always verify server-approved game status before play.
      <span className="block mt-2">
        <Link to="/ResponsiblePlay" className="underline">Responsible Play</Link> · <Link to="/PrivacyPolicy" className="underline">Privacy</Link> · <Link to="/TermsOfService" className="underline">Terms</Link>
      </span>
    </footer>
  </div>;
}
