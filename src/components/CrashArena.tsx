import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { BETTING_MS, CRASH_MAX, TREBALL_PAYOUT, treballColor } from "../lib/crash";

type Mode = "crash" | "trenball";
type Phase = "betting" | "live" | "crashed";
type BetMode = "crash_manual" | "crash_auto" | "tren_red" | "tren_green" | "tren_yellow";
type Bet = { id: string; round: number; mode: BetMode; units: number; target: number | null; status: "active" | "won" | "lost"; paidUnits: number; cashoutX: number | null };
type Proof = { round: number; crashPoint: number; durationMs: number; commitment: string; serverSeed: string };
type GameState = {
  round: number; phase: Phase; serverTime: string; startedAt: string; bettingEndsAt: string;
  multiplier: number; commitment: string; lastResult: Proof | null;
  joined: boolean; chips: number; players: number; myBets: Bet[];
  history: Proof[]; publicBets: { mode: BetMode; units: number; count: number }[];
  practiceOnly: true; realMoneyEnabled: false;
};
const button = (accent = false): React.CSSProperties => ({
  background: accent ? "#f0bd57" : "#28324b", color: accent ? "#141725" : "#f8f4eb",
  border: "1px solid " + (accent ? "#f0bd57" : "#46526a"), padding: "11px 15px",
  borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer"
});
const panel: React.CSSProperties = { background: "#161e32", border: "1px solid #35415c", borderRadius: 18, padding: 20 };
const field: React.CSSProperties = { color: "#fafafa", background: "#101827", border: "1px solid #64718e", borderRadius: 9, padding: 10 };
const asNumber = (n: number | string) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
const multiplierAt = (ms: number) => Math.min(CRASH_MAX, Math.round((Math.exp(Math.log(CRASH_MAX + 1) * Math.min(40000, Math.max(0, ms)) / 40000) - 1) * 100) / 100);

export default function CrashArena({ signedIn, canAct }: { signedIn: boolean; canAct: boolean }) {
  const [mode, setMode] = useState<Mode>("crash");
  const [state, setState] = useState<GameState | null>(null);
  const [stake, setStake] = useState(10);
  const [auto, setAuto] = useState(false);
  const [autoTarget, setAutoTarget] = useState(2);
  const [trenColor, setTrenColor] = useState<"red" | "green" | "yellow">("red");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [stamp, setStamp] = useState(Date.now());
  const serverOffset = useRef(0);
  const polling = useRef(false);
  const mounted = useRef(true);

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("ig-crash-v2", { body });
    if (error) {
      const context = (error as { context?: Response }).context;
      const detail = context?.json ? await context.json().catch(() => null) : null;
      throw new Error(detail?.error || error.message || "Game server unavailable");
    }
    if (data?.error) throw new Error(data.error);
    if (data?.state && mounted.current) {
      const next = data.state as GameState;
      if (!next.practiceOnly || next.realMoneyEnabled !== false) throw new Error("Unexpected financial game mode");
      serverOffset.current = new Date(next.serverTime).getTime() - Date.now();
      setState(next);
    }
    return data;
  }, []);

  const refresh = useCallback(async () => {
    if (!signedIn || polling.current) return;
    polling.current = true;
    try { await invoke({ action: "state" }); if (mounted.current) setNotice(n => n === "Game server unavailable" ? "" : n); }
    catch (e) { if (mounted.current) setNotice(e instanceof Error ? e.message : "Game server unavailable"); }
    finally { polling.current = false; }
  }, [signedIn, invoke]);

  useEffect(() => {
    mounted.current = true;
    if (signedIn) void refresh();
    const pollId = window.setInterval(() => { if (signedIn) void refresh(); }, 700);
    const drawId = window.setInterval(() => setStamp(Date.now()), 75);
    return () => { mounted.current = false; window.clearInterval(pollId); window.clearInterval(drawId); };
  }, [signedIn, refresh]);

  const serverNow = stamp + serverOffset.current;
  const bettingRemaining = state?.phase === "betting" ? Math.max(0, new Date(state.bettingEndsAt).getTime() - serverNow) : 0;
  const estimatedLive = state?.phase === "live" ? multiplierAt(serverNow - new Date(state.startedAt).getTime()) : 0;
  const shownX = state?.phase === "betting" ? 0 : state?.phase === "crashed" ? state.multiplier : estimatedLive;
  const currentBet = state?.myBets.find(b => b.round === state.round && b.mode === "crash_manual" && b.status === "active");
  const roundBets = state?.myBets.filter(b => b.round === state.round) ?? [];

  async function act(action: "join" | "leave" | "refill" | "bet" | "cashout") {
    if (busy || !canAct || !state) return;
    setBusy(true); setNotice("");
    try {
      let body: Record<string, unknown> = { action };
      if (action === "bet") {
        if (!Number.isSafeInteger(stake) || stake < 1 || stake > 100) throw new Error("Choose 1–100 practice chips");
        const selected: BetMode = mode === "trenball" ? ("tren_" + trenColor) as BetMode : auto ? "crash_auto" : "crash_manual";
        body = { action, round: state.round, requestId: crypto.randomUUID(), mode: selected,
          target: selected === "crash_auto" ? autoTarget : null, units: stake };
      }
      if (action === "cashout") {
        if (!currentBet) throw new Error("No active manual Crash bet");
        body = { action, round: state.round, requestId: crypto.randomUUID(), betId: currentBet.id };
      }
      const data = await invoke(body);
      if (action === "cashout" && data?.action?.cashoutX != null)
        setNotice(`Cashed out at ${Number(data.action.cashoutX).toFixed(2)}× · ${asNumber(data.action.paidUnits)} practice chips returned.`);
      else if (action === "bet") setNotice("Practice bet accepted by the game server.");
      else if (action === "refill") setNotice("Practice chips refilled.");
      await refresh();
    } catch (e) { setNotice(e instanceof Error ? e.message : "Action failed"); await refresh(); }
    finally { setBusy(false); }
  }

  const [verification, setVerification] = useState<string>("");
  async function verify(proof: Proof) {
    try {
      const input = `${proof.serverSeed}:${Number(proof.crashPoint).toFixed(2)}:${proof.durationMs}`;
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
      const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
      setVerification(hash === proof.commitment
        ? `Round #${proof.round}: committed seed and revealed outcome match.`
        : "The revealed proof DOES NOT match the commitment. Contact support.");
    } catch { setVerification("Unable to verify this round's SHA-256 commitment."); }
  }

  const points = Array.from({ length: 49 }, (_, i) => {
    const elapsed = i * Math.max(0, serverNow - (state ? new Date(state.startedAt).getTime() : 0)) / 48;
    const value = state?.phase === "live" ? multiplierAt(elapsed) : 0;
    const horizontal = 16 + i * 568 / 48;
    const vertical = 190 - Math.min(1, Math.log1p(value) / Math.log(CRASH_MAX + 1)) * 174;
    return `${horizontal.toFixed(1)},${vertical.toFixed(1)}`;
  }).join(" ");

  return <section aria-label="Crash and Trenball practice arena" style={{ ...panel, marginTop: 26, padding: 24, background: "linear-gradient(145deg,#111b32,#211b35)" }}>
    <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
      <div><h2 style={{ margin: 0, color: "#f4c977" }}>🚀 Crash / Trenball</h2><p style={{ marginBottom: 0, color: "#b7c3d9" }}>One live multiplier round · two ways to play · synchronized practice table</p></div>
      <div style={{ display: "flex", gap: 7 }}><button type="button" aria-pressed={mode === "crash"} style={button(mode === "crash")} onClick={() => setMode("crash")}>Crash</button><button type="button" aria-pressed={mode === "trenball"} style={button(mode === "trenball")} onClick={() => setMode("trenball")}>Trenball</button></div>
    </div>
    <p style={{ fontSize: 12, color: "#e2d3a6" }}>STAGING • FREE PLAY ONLY • Practice chips have no monetary value and are separate from IGN and IGD.</p>
    {!signedIn && <p role="status">Sign in under Account to view shared server rounds and join the practice table.</p>}
    {signedIn && <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(230px, 1fr)", gap: 16 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ background: "#070f20", border: "1px solid #394566", borderRadius: 15, overflow: "hidden", position: "relative", padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#a1aeca", gap: 8, flexWrap: "wrap" }}>
            <span>Round #{state?.round ?? "–"}</span><span>{state?.players ?? 0} players connected</span>
            <span>{state?.phase === "betting" ? `Betting · ${(bettingRemaining / 1000).toFixed(1)}s` : state?.phase === "live" ? "🚀 IN FLIGHT" : "💥 CRASHED"}</span>
          </div>
          <div aria-live="off" style={{ textAlign: "center", fontSize: "clamp(34px, 6vw, 74px)", fontWeight: 900, color: state?.phase === "crashed" ? "#fb7777" : "#f6d78e", paddingTop: 15, fontVariantNumeric: "tabular-nums" }}>{shownX.toFixed(2)}×</div>
          <svg viewBox="0 0 600 204" role="img" aria-label="Multiplier flight visualization" style={{ width: "100%", maxHeight: 250 }}>
            <defs><linearGradient id="crashFlight" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#cf833c"/><stop offset="100%" stopColor="#f4d16d"/></linearGradient></defs>
            <path d="M16 190H584M16 10V190" fill="none" stroke="#394462" strokeWidth="2" />
            {state?.phase === "live" && <polyline points={points} fill="none" stroke="url(#crashFlight)" strokeWidth="5" strokeLinecap="round" />}
            <text x="30" y="25" fontSize="12" fill="#aebadb">{state?.phase === "betting" ? `Launching in ${(bettingRemaining/1000).toFixed(1)} seconds` : state?.phase === "live" ? "Server-timed flight" : "The flight has ended"}</text>
          </svg>
          <div style={{ overflowWrap: "anywhere", fontSize: 11, color: "#9fb1ca" }}>Pre-flight SHA-256 commitment: {state?.commitment ?? "loading…"}</div>
        </div>
        <div style={{ ...panel, marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <strong>Your practice chips: {asNumber(state?.chips ?? 0)}</strong>
            {state?.joined ? <button type="button" disabled={!canAct || busy} style={button()} onClick={() => void act("leave")}>Leave table</button> :
              <button type="button" disabled={!canAct || busy || !state} style={button(true)} onClick={() => void act("join")}>Join practice table</button>}
          </div>
          {state?.joined && <>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 15 }}>
              <label>Stake <input aria-label="Practice chip stake" type="number" min={1} max={100} step={1} style={{ ...field, width: 90, marginLeft: 8 }} value={stake} onChange={e => setStake(Number(e.target.value))}/></label>
              {mode === "crash" && <><label><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)}/> Auto cashout</label>{auto && <label>At <select style={field} value={autoTarget} onChange={e => setAutoTarget(Number(e.target.value))}>{[1.5, 2, 3, 5, 10].map(v => <option key={v} value={v}>{v.toFixed(2)}×</option>)}</select></label>}</>}
              {mode === "trenball" && <label>Color <select style={field} value={trenColor} onChange={e => setTrenColor(e.target.value as "red"|"green"|"yellow")}><option value="red">Red 0.00–1.99 · 1.97×</option><option value="green">Green 2.00–9.99 · 2×</option><option value="yellow">Yellow 10.00–12,000 · 10×</option></select></label>}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              <button type="button" style={button(true)} disabled={busy || !canAct || !state || state.phase !== "betting" || bettingRemaining <= 0 || stake > state.chips || !Number.isSafeInteger(stake) || stake < 1 || stake > 100} onClick={() => void act("bet")}>Place {mode === "crash" ? "Crash" : "Trenball"} bet</button>
              {currentBet && mode === "crash" && <button type="button" style={button(true)} disabled={busy || !canAct || state.phase !== "live" || shownX <= 0} onClick={() => void act("cashout")}>Cash out at live multiplier</button>}
              {state.chips < 10 && <button type="button" disabled={busy || !canAct} style={button()} onClick={() => void act("refill")}>Free practice refill</button>}
            </div>
          </>}
          {!canAct && <p>Read-only accounts may view rounds, but cannot bet or cash out.</p>}
          {notice && <p role="status" style={{ color: "#f7d99d" }}>{notice}</p>}
        </div>
      </div>
      <div style={{ display: "grid", gap: 12, alignContent: "start", minWidth: 0 }}>
        <div style={panel}><h3 style={{ marginTop: 0 }}>Your current bets</h3>{roundBets.length === 0 ? <p style={{ color: "#a7b5cb" }}>None this round.</p> : roundBets.map(b => <p key={b.id} style={{ fontSize: 13, borderBottom: "1px solid #35415c", paddingBottom: 8 }}>{b.mode.replace("_", " ")} · {b.units} chips<br />{b.status.toUpperCase()}{b.cashoutX != null ? ` · ${Number(b.cashoutX).toFixed(2)}×` : ""}{b.status !== "active" ? ` · return ${b.paidUnits}` : ""}</p>)}</div>
        <div style={panel}><h3 style={{ marginTop: 0 }}>Last 12 rounds</h3><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{(state?.history ?? []).map(r => <span key={r.round} title={`Round #${r.round}`} style={{ background: treballColor(Number(r.crashPoint)) === "red" ? "#6c344a" : treballColor(Number(r.crashPoint)) === "green" ? "#24594f" : "#756026", borderRadius: 7, padding: "5px 7px", fontSize: 12 }}>{Number(r.crashPoint).toFixed(2)}×</span>)}</div><p style={{ color: "#a7b5cb", fontSize: 12 }}>Red / green / yellow outcomes are shared with Trenball.</p></div>
        <div style={panel}><h3 style={{ marginTop: 0 }}>Fairness verification</h3><p style={{ fontSize: 12, color: "#a7b5cb" }}>A seed hash is published before betting. The seed and outcome are revealed only after the round crashes.</p>{state?.lastResult && <button type="button" style={button()} onClick={() => void verify(state.lastResult!)}>Verify last round #{state.lastResult.round}</button>}{verification && <p role="status" style={{ fontSize: 12 }}>{verification}</p>}</div>
      </div>
    </div>}
    <p style={{ fontSize: 12, color: "#a8b5ca", marginBottom: 0 }}>Betting window: {BETTING_MS/1000}s · Outcome range: 0.00–{CRASH_MAX.toLocaleString()}× · Treball return factors: {TREBALL_PAYOUT.red}× / {TREBALL_PAYOUT.green}× / {TREBALL_PAYOUT.yellow}×. Cashouts, round progression and credits are server-controlled. Financial settlement is disabled.</p>
  </section>;
}
