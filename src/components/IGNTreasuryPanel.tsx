import { useEffect, useState } from "react";
import IGNAllocationChart from "./IGNAllocationChart";
import { IGN_ATOMIC_SUPPLY, IGN_DEVNET } from "../lib/ign/asset-registry";
import { getIgnMintSnapshot } from "../lib/ign/devnet-rpc";
import type { MintSnapshot } from "../lib/ign/devnet-rpc";
import { atomicToTokenString } from "../lib/ign/format-token-units";
import { readCurrentTreasuryRole } from "../lib/ign/treasury-access";

type PermissionState = "checking" | "denied" | "allowed";
export default function IGNTreasuryPanel({ userId }: { userId: string }) {
  const [permission, setPermission] = useState<PermissionState>("checking");
  const [mint, setMint] = useState<MintSnapshot | null>(null);
  const [mintError, setMintError] = useState("");

  useEffect(() => {
    let alive = true;
    setPermission("checking");
    void readCurrentTreasuryRole()
      .then(status => { if (alive) setPermission(status === "superadmin" ? "allowed" : "denied"); })
      .catch(() => { if (alive) setPermission("denied"); });
    return () => { alive = false; };
  }, [userId]);

  useEffect(() => {
    if (permission !== "allowed") { setMint(null); return; }
    const controller = new AbortController();
    void getIgnMintSnapshot(controller.signal)
      .then(data => { if (!controller.signal.aborted) { setMint(data); setMintError(""); } })
      .catch(e => { if (!controller.signal.aborted) setMintError(e instanceof Error ? e.message : "Devnet mint unavailable"); });
    return () => controller.abort();
  }, [permission]);

  const card = { background: "#151D2D", border: "1px solid #45405C", borderRadius: 15, padding: 18 } as const;
  if (permission === "checking") return <section aria-label="IGN Royal Treasury"><h2>IGN Royal Treasury</h2><p role="status">Checking your Supabase Superadmin permission…</p></section>;
  if (permission === "denied") return <section aria-label="IGN Royal Treasury"><h2>IGN Royal Treasury</h2><p role="alert">Access restricted to a verified Superadmin account. Your current Supabase role does not grant access.</p></section>;

  return <section aria-label="IGN Royal Treasury" style={{ ...card, marginTop: 24, background: "linear-gradient(150deg,#111621,#23172D)" }}>
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
      <img src={IGN_DEVNET.logoUri} alt="IGN seven-point crown pink panther" width={70} height={70} style={{ borderRadius: 16, objectFit: "contain", background: "#0B0E16" }}/>
      <div style={{ flex: 1 }}>
        <p style={{ color: "#F54EAC", fontWeight: 700, margin: "0 0 2px" }}>IMPERIAL GAMES · SUPERADMIN</p>
        <h2 style={{ color: "#F0CB7B", margin: 0 }}>Royal Treasury</h2>
        <p style={{ color: "#BAC3D6", margin: "5px 0 0" }}>Allocation planning and verified Devnet supply · read only</p>
      </div>
      <span style={{ color: "#FAD1E8", border: "1px solid #F54EAC", padding: "7px 10px", borderRadius: 22 }}>DEVNET · TEST</span>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, margin: "22px 0" }}>
      <div style={card}><small>Live IGN minted supply</small><h3 style={{ color: "#F0CB7B", overflowWrap: "anywhere", fontSize: 21 }}>{mint ? atomicToTokenString(mint.supplyAtomic) + " IGN" : "Unavailable"}</h3><small>{mint ? `Checked at slot ${mint.slot || "unknown"}` : mintError || "Querying Devnet…"}</small></div>
      <div style={card}><small>Mint authority</small><h3>{mint ? mint.mintAuthority === null ? "Revoked" : "Present" : "Not verified"}</h3><small>Freeze: {mint ? mint.freezeAuthority === null ? "None" : "Present" : "not verified"}</small></div>
      <div style={card}><small>Circulating supply</small><h3>Not established</h3><small>Do not use total minted as circulating</small></div>
      <div style={card}><small>Verified allocation wallets</small><h3>Not configured</h3><small>Actual balances must be read from chain</small></div>
    </div>
    {mint && mint.supplyAtomic !== IGN_ATOMIC_SUPPLY && <p role="alert" style={{ color: "#FFD2A3" }}>Devnet supply and approved planning total differ. Investigate before assigning wallets.</p>}
    <IGNAllocationChart/>
    <div style={{ ...card, marginTop: 20 }}>
      <h3 style={{ color: "#F0CB7B", marginTop: 0 }}>Treasury custody & vesting</h3>
      <p>Wallet registry: <strong>Not configured</strong>. No multisig signer assignments, category transfers, or chain-verified escrow balances have been entered.</p>
      <p>Vesting: <strong>Draft only</strong>. Suggested team cliff and staged partner grants are not enforced by a contract.</p>
      <p>Transfer proposals and approvals: <strong>Disabled</strong>. This screen has no write requests, signature prompts or private keys.</p>
      <a href={IGN_DEVNET.explorer} rel="noopener noreferrer" target="_blank" style={{ color: "#F0CB7B" }}>Verify IGN on Solana Explorer ↗</a>
    </div>
    <p style={{ color: "#AEBAD1", fontSize: 13 }}>Authorization is checked against Supabase <code>public.user_roles</code> using the authenticated user. This is a UI for published planning data only; privileged treasury records require independent database RLS if implemented later. No Mainnet price or token movements are supported.</p>
  </section>;
}
