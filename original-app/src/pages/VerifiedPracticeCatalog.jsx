import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { readApprovedPracticeGames } from '@/lib/supabaseLegacyReads';
import { Gamepad2, Dices, ShieldCheck, LockKeyhole, RefreshCw, Trophy } from 'lucide-react';

const validRoutes = new Set(['/PlayDice']);
export default function VerifiedPracticeCatalog() {
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['supabase-approved-practice-games-v1'],
    queryFn: () => readApprovedPracticeGames({ is_active: true }),
    staleTime: 60_000,
  });
  const games = (data || []).filter(g => g.practice_only === true &&
    g.real_wagers_enabled === false && validRoutes.has(g.route));
  return <main className="min-h-screen pb-20 text-white bg-[#0A0612]">
    <header className="bg-gradient-to-r from-[#291b3e] via-[#19152c] to-[#17283b] border-b border-white/10">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <p className="flex items-center gap-2 text-amber-300 text-xs font-bold tracking-widest"><ShieldCheck size={18}/> SUPABASE VERIFIED GAMES</p>
        <h1 className="text-4xl sm:text-5xl font-black mt-3">Imperial Game Library</h1>
        <p className="mt-3 text-gray-300 max-w-2xl">Only games backed by an approved, authenticated practice service are playable here. Everything else stays disabled until its migration and security checks pass.</p>
      </div>
    </header>
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex justify-between flex-wrap gap-3 items-center mb-5">
        <h2 className="font-bold text-2xl">Verified practice games</h2>
        <button type="button" onClick={() => void refetch()} className="flex items-center gap-2 border border-white/20 rounded-xl px-4 py-2 text-sm hover:bg-white/5">
          <RefreshCw size={16}/> Refresh library
        </button>
      </div>
      <p className="p-4 border border-amber-500/30 bg-amber-900/10 rounded-xl text-amber-100 mb-6 text-sm">Free-play testing only. No purchases, redeemable credits, financial settlement, prize claims or IGN transfers.</p>
      {isLoading && <p role="status">Checking verified game availability…</p>}
      {error && <p role="alert" className="text-rose-300">Cannot verify active games. No unverified titles will be shown.</p>}
      {games.length>0 && <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-5">
        {games.map(g => <article key={g.slug} className="rounded-3xl border border-amber-500/25 bg-[#17172a] p-7 flex flex-col">
          <div className="w-16 h-16 rounded-2xl bg-amber-400/15 text-amber-300 flex items-center justify-center"><Dices size={34}/></div>
          <h3 className="font-black text-xl mt-5">{g.name}</h3>
          <p className="text-gray-400 text-sm mt-2 flex-1">{g.description}</p>
          <p className="text-emerald-300 text-xs font-semibold mt-4">VERIFIED · PRACTICE ONLY</p>
          <Link to={g.route} className="mt-4 bg-amber-400 text-gray-950 rounded-xl text-center py-3 px-5 font-bold hover:bg-amber-300">Play practice game →</Link>
        </article>)}
      </div>}
      {!isLoading && !error && games.length===0 && <p role="status" className="rounded-xl p-10 bg-white/5">No server-approved games are active. Unverified games remain closed.</p>}
      <section className="grid md:grid-cols-2 gap-5 mt-8">
        <Link to="/Leaderboard" className="rounded-2xl border border-white/10 bg-[#17172a] p-6 hover:border-amber-500/30">
          <Trophy className="text-amber-300" size={26}/><h3 className="font-bold text-xl mt-3">Weekly practice board</h3><p className="text-sm text-gray-400 mt-2">See anonymized verified practice results.</p>
        </Link>
        <div className="rounded-2xl border border-white/10 bg-[#17172a] p-6">
          <LockKeyhole className="text-gray-400" size={26}/>
          <h3 className="font-bold text-xl mt-3">Other Imperial games</h3>
          <p className="text-sm text-gray-400 mt-2">Poker, Crash, Craps, Roulette, Blackjack and other migrated previews are integrated and released separately when their route and backend tests pass.</p>
        </div>
      </section>
    </div>
  </main>;
}
