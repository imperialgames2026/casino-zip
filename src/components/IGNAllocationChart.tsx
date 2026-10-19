import { IGN_ALLOCATION, IGN_DEVNET } from "../lib/ign/asset-registry";
import { integerTokenString } from "../lib/ign/format-token-units";

/** Approved working budget, not circulating supply or token balances. */
export default function IGNAllocationChart() {
  return <section aria-labelledby="ign-budget-heading">
    <h3 id="ign-budget-heading" style={{ color: "#EAC66E", marginBottom: 8 }}>Approved working allocation</h3>
    <p style={{ color: "#BAC3D6", marginTop: 0 }}>Planning only · 10 billion IGN · No category transfers or custody assignments confirmed.</p>
    <div style={{ height: 14, borderRadius: 20, display: "flex", overflow: "hidden", margin: "18px 0 22px" }}
      role="img" aria-label={IGN_ALLOCATION.map(item => `${item.label} ${item.percent}%`).join(", ")}>
      {IGN_ALLOCATION.map(item => <div key={item.key} style={{ width: `${item.percent}%`, background: item.color }} />)}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
      {IGN_ALLOCATION.map(item => <div key={item.key} style={{ border: "1px solid #394256", borderRadius: 12, padding: 14, background: "#141C2A" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: item.color, flexShrink: 0 }}/>
          <strong style={{ flex: 1 }}>{item.label}</strong>
          <strong style={{ color: "#F1D288" }}>{item.percent}%</strong>
        </div>
        <p style={{ margin: "10px 0 2px", fontSize: 20, fontVariantNumeric: "tabular-nums" }}>{integerTokenString(item.amount)} IGN</p>
        <small style={{ color: "#BDC4D2" }}>Planned amount · not on-chain assigned</small>
      </div>)}
    </div>
    <p style={{ color: "#A7B3CA", fontSize: 13, marginBottom: 0 }}>Mint: <code style={{ overflowWrap: "anywhere" }}>{IGN_DEVNET.mint}</code></p>
  </section>;
}
