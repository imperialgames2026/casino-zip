import { useEffect, useState } from "react";
import { IGN_ATOMIC_SUPPLY, IGN_DEVNET } from "../lib/ign/asset-registry";
import { getIgnMintSnapshot, getIgnOwnerSnapshot, isSolanaPublicKey } from "../lib/ign/devnet-rpc";
import type { MintSnapshot, OwnerSnapshot } from "../lib/ign/devnet-rpc";
import { atomicToTokenString } from "../lib/ign/format-token-units";

type Phantom = {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect: () => Promise<{ publicKey: { toString(): string } }>;
};
const btn = { border: "1px solid #D9B35B", background: "#D9B35B", color: "#10121A", padding: "11px 16px", borderRadius: 10, fontWeight: 700, cursor: "pointer" } as const;
const panel = { background: "#111925", border: "1px solid #45405C", borderRadius: 16, padding: 20 } as const;
const shorten = (value: string) => `${value.slice(0, 7)}…${value.slice(-7)}`;

export default function IGNWalletPanel() {
  const [address, setAddress] = useState("");
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<OwnerSnapshot | null>(null);
  const [mint, setMint] = useState<MintSnapshot | null>(null);
  const [mintError, setMintError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void getIgnMintSnapshot(controller.signal)
      .then(result => { if (!controller.signal.aborted) { setMint(result); setMintError(""); } })
      .catch(e => { if (!controller.signal.aborted) setMintError(e instanceof Error ? e.message : "Mint status unavailable"); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selected) { setToken(null); setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setError(""); setToken(null);
    void getIgnOwnerSnapshot(selected, controller.signal)
      .then(result => { if (!controller.signal.aborted) setToken(result); })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Unable to read wallet"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selected]);

  async function connectPhantom() {
    const candidate = (window as Window & { phantom?: { solana?: Phantom }; solana?: Phantom }).phantom?.solana
      ?? (window as Window & { solana?: Phantom }).solana;
    if (!candidate?.isPhantom || typeof candidate.connect !== "function") {
      setError("Phantom was not detected. Install/unlock Phantom, or enter any Solana public address below.");
      return;
    }
    try {
      setError("");
      const connected = await candidate.connect();
      const publicAddress = connected.publicKey.toString();
      if (!isSolanaPublicKey(publicAddress)) throw new Error("Wallet returned an invalid public address");
      setAddress(publicAddress);
      setSelected(publicAddress);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet connection cancelled");
    }
  }

  return <section style={{ ...panel, background: "linear-gradient(125deg,#131622,#251B32 80%,#151623)" }} aria-label="IGN Solana Devnet wallet">
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, marginBottom: 16 }}>
      <img src={IGN_DEVNET.logoUri} width={78} height={78} alt="Imperial Games Network pink panther wearing a seven-point gold crown" style={{ objectFit: "contain", borderRadius: 18, background: "#0B0E16" }}/>
      <div style={{ flex: 1, minWidth: 210 }}>
        <p style={{ margin: "0 0 3px", color: "#F54EAC", letterSpacing: "0.07em", fontWeight: 700 }}>IMPERIAL GAMES NETWORK</p>
        <h2 style={{ fontSize: "clamp(25px,3.5vw,36px)", margin: 0, color: "#F1D288" }}>IGN Wallet</h2>
        <p style={{ margin: "7px 0 0", color: "#BAC3D6" }}>Read-only Solana SPL token viewer</p>
      </div>
      <span style={{ border: "1px solid #F54EAC", color: "#FFD4EB", borderRadius: 40, padding: "7px 12px", fontWeight: 700 }}>DEVNET · TEST</span>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12, marginBottom: 18 }}>
      <div style={panel}><span style={{ color: "#BDC4D2" }}>Wallet balance</span><div style={{ color: "#F2DB9A", fontSize: 25, margin: "8px 0", overflowWrap: "anywhere", fontVariantNumeric: "tabular-nums" }}>
        {loading ? "Checking Devnet…" : token ? `${atomicToTokenString(token.amountAtomic)} IGN` : "—"}
      </div><small style={{ color: "#AEBAD1" }}>{token ? `${token.accounts} token account(s) · slot ${token.slot || "unavailable"}` : "Connect or enter a public address"}</small></div>
      <div style={panel}><span style={{ color: "#BDC4D2" }}>Minted supply (live)</span><div style={{ fontSize: 25, color: "#F2DB9A", margin: "8px 0", overflowWrap: "anywhere" }}>
        {mint ? `${atomicToTokenString(mint.supplyAtomic)} IGN` : "—"}
      </div><small style={{ color: "#AEBAD1" }}>{mint ? `Mint: ${mint.mintAuthority === null ? "revoked" : "enabled"} · Freeze: ${mint.freezeAuthority === null ? "none" : "enabled"}` : mintError || "Querying Devnet…"}</small></div>
    </div>
    {mint && mint.supplyAtomic !== IGN_ATOMIC_SUPPLY && <p role="alert" style={{ color: "#FFD2A3" }}>The live mint supply differs from the approved 10B design. Review the mint before continuing.</p>}
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
      <button style={btn} type="button" onClick={() => void connectPhantom()}>Connect Phantom (view only)</button>
      <a href={IGN_DEVNET.explorer} target="_blank" rel="noopener noreferrer" style={{ ...btn, background: "transparent", color: "#EBCB7C", textDecoration: "none" }}>View token on explorer ↗</a>
    </div>
    <form onSubmit={event => { event.preventDefault(); const value = address.trim(); if (!isSolanaPublicKey(value)) { setError("Enter a valid Solana public address"); return; } setError(""); if (value === selected) { setSelected(""); queueMicrotask(() => setSelected(value)); } else setSelected(value); }}>
      <label htmlFor="ign-watch-address" style={{ color: "#E6DFE7", display: "block", marginBottom: 6 }}>Look up an address (no wallet connection required)</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <input id="ign-watch-address" value={address} autoComplete="off" spellCheck={false} onChange={e => setAddress(e.target.value)}
          placeholder="Solana public wallet address" style={{ flex: "1 1 260px", minWidth: 0, padding: 12, borderRadius: 8, background: "#090F19", color: "#fff", border: "1px solid #73678B" }}/>
        <button style={btn} type="submit">View balance</button>
      </div>
    </form>
    {selected && <p style={{ overflowWrap: "anywhere", color: "#CDD5E1", fontSize: 13 }}>Viewing: <strong title={selected}>{shorten(selected)}</strong> · Public Devnet account lookup</p>}
    {error && <p role="alert" style={{ color: "#FFB6B6" }}>{error}</p>}
    <p style={{ marginBottom: 0, fontSize: 13, color: "#B5BCD0" }}>
      IGN · Devnet only · 9 decimals. Public RPC receives the selected address. Connecting Phantom does not sign a transaction or link a wallet to your Imperial Games account. There is no established IGN market price, no deposits, withdrawals, or payouts here.
    </p>
    <p style={{ marginBottom: 0, fontSize: 13, color: "#B5BCD0" }}>IGD in-app balance, IGT legacy tokens, GC/SC, and nonredeemable practice chips remain separate from IGN.</p>
  </section>;
}
