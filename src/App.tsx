import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { verifyFairRound } from "./lib/fairness";

type Page = "Lobby" | "Games" | "Wallet" | "Account";
const games = [
  { name: "Royal Dice", icon: "🎲", description: "Roll two dice and aim for seven.", type: "dice" },
  { name: "Imperial Coin", icon: "🪙", description: "Guess heads or tails.", type: "coin" },
  { name: "Lucky Number", icon: "✨", description: "Pick a number from one to six.", type: "number" }
] as const;
type GameType = typeof games[number]["type"];

export default function App() {
  const [page, setPage] = useState<Page>("Lobby");
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup" | "reset">("signin");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeGame, setActiveGame] = useState<GameType | null>(null);
  const [guess, setGuess] = useState("heads");
  const [result, setResult] = useState("");
  const [rounds, setRounds] = useState(0);
  const [fairProof, setFairProof] = useState("");
  const [fairBusy, setFairBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => { if (mounted) setSession(data.session); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) { setNotice("Authentication is unavailable until Supabase environment variables are configured."); return; }
    setBusy(true); setNotice("");
    try {
      const response = authMode === "signup"
        ? await supabase.auth.signUp({ email, password })
        : authMode === "reset"
        ? await supabase.auth.resetPasswordForEmail(email)
        : await supabase.auth.signInWithPassword({ email, password });
      if (response.error) throw response.error;
      setNotice(authMode === "signup" ? "Account created. Check your email if confirmation is required." : authMode === "reset" ? "If the account exists, a recovery email has been sent." : "Signed in.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Authentication failed."); }
    finally { setBusy(false); }
  }

  function play() {
    if (!activeGame) return;
    const random = new Uint32Array(2);
    crypto.getRandomValues(random);
    const a = random[0] % 6 + 1;
    const b = random[1] % 6 + 1;
    if (activeGame === "dice") setResult(`Dice: ${a} + ${b} = ${a + b}. ${a + b === 7 ? "Seven! You win this demo round." : "Try again."}`);
    if (activeGame === "coin") {
      const flip = random[0] % 2 ? "heads" : "tails";
      setResult(`Coin landed ${flip}. ${guess === flip ? "Correct!" : "Not this time."}`);
    }
    if (activeGame === "number") setResult(`Lucky number: ${a}. ${Number(guess) === a ? "Correct!" : "Try again."}`);
    setRounds(value => value + 1);
  }

  async function playServerRound() {
    if (!activeGame || !session || fairBusy) return;
    setFairBusy(true); setResult(""); setFairProof("");
    try {
      const clientSeed = crypto.randomUUID();
      const { data: committed, error: commitError } = await supabase.functions.invoke("provably-fair-demo", { body: { action: "commit", game: activeGame, clientSeed } });
      if (commitError || !committed?.id) throw commitError ?? new Error("Commit failed");
      setFairProof("Committed hash: " + committed.server_seed_hash);
      const { data: revealed, error: revealError } = await supabase.functions.invoke("provably-fair-demo", { body: { action: "reveal", roundId: committed.id } });
      if (revealError || !revealed?.serverSeed) throw revealError ?? new Error("Reveal failed");
      if (revealed.roundId !== committed.id || revealed.game !== activeGame || revealed.clientSeed !== clientSeed || revealed.nonce !== committed.nonce || revealed.serverSeedHash !== committed.server_seed_hash) throw new Error("Round commitment mismatch");
      const verified = await verifyFairRound({ game: activeGame, serverSeed: revealed.serverSeed, clientSeed, nonce: revealed.nonce, serverSeedHash: committed.server_seed_hash, outcome: revealed.outcome });
      if (!verified) throw new Error("Provably fair result verification failed");
      setFairProof("Verified SHA-256 commitment and HMAC outcome: " + committed.server_seed_hash + " | Round: " + revealed.roundId + " | Client seed: " + revealed.clientSeed + " | Server seed: " + revealed.serverSeed);
      setResult("Server result: " + JSON.stringify(revealed.outcome));
      setRounds(v => v + 1);
    } catch (error) { setResult(error instanceof Error ? error.message : "Unable to play server round"); }
    finally { setFairBusy(false); }
  }

  const buttonStyle = { padding: "12px 18px", borderRadius: 10, border: "1px solid #b7954c", background: "#b7954c", color: "#111827", cursor: "pointer", fontWeight: 700 } as const;
  const panelStyle = { background: "#19243b", border: "1px solid #34415a", borderRadius: 16, padding: 24 } as const;
  const inputStyle = { padding: 12, borderRadius: 8, border: "1px solid #62708a", background: "#101a2e", color: "white", width: "100%", boxSizing: "border-box" } as const;

  return <div style={{ minHeight: "100vh", background: "#0b1221", color: "#f7f3e8", fontFamily: "system-ui, sans-serif" }}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "20px max(24px, 6vw)", borderBottom: "1px solid #34415a" }}>
      <strong style={{ fontSize: 25, color: "#e4c47d" }}>♛ Imperial Games</strong>
      <nav aria-label="Main navigation" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {(["Lobby", "Games", "Wallet", "Account"] as const).map(item => <button key={item} onClick={() => { setPage(item); setActiveGame(null); setNotice(""); }} aria-current={page === item ? "page" : undefined} style={{ ...buttonStyle, background: page === item ? "#b7954c" : "#19243b", color: page === item ? "#111827" : "#f7f3e8" }}>{item}</button>)}
      </nav>
    </header>
    <main style={{ maxWidth: 1100, margin: "auto", padding: "48px 24px" }}>
      <div style={{ background: "#30271b", color: "#f6d999", padding: 14, borderRadius: 10, marginBottom: 28 }} role="status">Free-play demonstration only. No real money, deposits, withdrawals, redeemable credits, or financial payouts.</div>
      {page === "Lobby" && <section>
        <h1 style={{ fontSize: "clamp(34px, 5vw, 60px)", marginBottom: 12 }}>Welcome to the Imperial Lobby</h1>
        <p style={{ color: "#b8c3d8", fontSize: 19 }}>Explore games, manage your account, and test the Imperial Games experience.</p>
        <button style={buttonStyle} onClick={() => setPage("Games")}>Explore games →</button>
        <div style={{ ...panelStyle, marginTop: 32 }}><h2>Platform status</h2><p>Demo games: available</p><p>Account authentication: {supabase ? "configured client (server connectivity not verified)" : "requires Supabase configuration"}</p><p>Payments and settlement: disabled pending secure backend validation</p></div>
      </section>}
      {page === "Games" && <section><h1>Free-play games</h1><p style={{ color: "#b8c3d8" }}>No stakes, balance changes, or prizes. Rounds played this visit: {rounds}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 }}>
          {games.map(game => <article key={game.type} style={panelStyle}><div style={{ fontSize: 48 }}>{game.icon}</div><h2>{game.name}</h2><p>{game.description}</p><button style={buttonStyle} onClick={() => { setActiveGame(game.type); setGuess(game.type === "number" ? "1" : "heads"); setResult(""); }}>Play demo</button></article>)}
        </div>
        {activeGame && <section style={{ ...panelStyle, marginTop: 24 }} aria-label="Selected game"><h2>{games.find(g => g.type === activeGame)?.name}</h2>
          {activeGame === "coin" && <label>Prediction <select style={inputStyle} value={guess} onChange={e => setGuess(e.target.value)}><option value="heads">Heads</option><option value="tails">Tails</option></select></label>}
          {activeGame === "number" && <label>Pick a number <select style={inputStyle} value={guess} onChange={e => setGuess(e.target.value)}>{[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}</select></label>}
          <p><button style={buttonStyle} onClick={play}>Local demo round</button> {session && <button style={buttonStyle} disabled={fairBusy} onClick={playServerRound}>{fairBusy ? "Calling server…" : "Play provably fair server round"}</button>}</p><p aria-live="polite">{result}</p>{fairProof && <p style={{ overflowWrap: "anywhere", fontSize: 12 }} aria-live="polite">{fairProof}</p>}{!session && <p>Sign in under Account to play verified server rounds.</p>}
        </section>}
      </section>}
      {page === "Wallet" && <section><h1>Wallet</h1><div style={panelStyle}><h2>Financial transactions unavailable</h2><p>This demo does not issue tokens, store a financial balance, accept deposits, process withdrawals, or provide payouts.</p><p>Secure ledger and payment workflows must be independently implemented and tested before activation.</p></div></section>}
      {page === "Account" && <section><h1>Account</h1><div style={{ ...panelStyle, maxWidth: 520 }}>
        {session ? <><p>Signed in as <strong>{session.user.email ?? session.user.id}</strong></p><button style={buttonStyle} onClick={async () => { const { error } = await supabase!.auth.signOut(); setNotice(error?.message ?? "Signed out."); }}>Sign out</button></> :
          <><h2>{authMode === "signin" ? "Sign in" : authMode === "signup" ? "Create account" : "Reset password"}</h2><form onSubmit={authenticate}>
            <label>Email<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle}/></label>
            {authMode !== "reset" && <label>Password<input required minLength={6} type="password" autoComplete={authMode === "signin" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} style={inputStyle}/></label>}
            <p><button disabled={busy || !supabase} style={buttonStyle} type="submit">{busy ? "Please wait…" : authMode === "signin" ? "Sign in" : authMode === "signup" ? "Sign up" : "Send recovery email"}</button></p>
          </form><div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>{(["signin", "signup", "reset"] as const).map(mode => <button key={mode} onClick={() => { setAuthMode(mode); setNotice(""); }} style={{ ...buttonStyle, background: "transparent", color: "#f7f3e8" }}>{mode === "signin" ? "Sign in" : mode === "signup" ? "Register" : "Forgot password?"}</button>)}</div></>}
        {notice && <p role="status" aria-live="polite">{notice}</p>}
        {!supabase && <p>Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable authentication.</p>}
      </div></section>}
    </main>
    <footer style={{ padding: 24, textAlign: "center", borderTop: "1px solid #34415a", color: "#b8c3d8" }}>© Imperial Games · Demo environment · No monetary value</footer>
  </div>;
}
