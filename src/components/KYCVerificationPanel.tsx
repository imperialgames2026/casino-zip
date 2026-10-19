import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type KycRow = { status: string; document_verified: boolean; selfie_verified: boolean } | null;
type SnsSdk = {
  init: (token: string, tokenRefresh: () => Promise<string>) => {
    withConf: (configuration: { lang: string }) => {
      withOptions: (options: { adaptIframeHeight: boolean }) => {
        build: () => { launch: (selector: string) => void };
      };
    };
  };
};
const DOCUMENTS_ENABLED = import.meta.env.VITE_KYC_DOCUMENTS_ENABLED === "true";
const PHONE_ENABLED = import.meta.env.VITE_KYC_PHONE_SMS_ENABLED === "true";
const PRIVACY_URL = import.meta.env.VITE_KYC_PRIVACY_URL || "";
const boxStyle = { padding: 17, border: "1px solid #504361", borderRadius: 12, background: "#151C29" } as const;
const buttonStyle = { padding: "11px 14px", border: 0, borderRadius: 8, background: "#D9B35B", color: "#14141C", cursor: "pointer", fontWeight: 700 } as const;

function providerSdk(): SnsSdk | undefined {
  return (window as Window & { snsWebSdk?: SnsSdk }).snsWebSdk;
}
async function loadProviderSdk(): Promise<SnsSdk> {
  if (providerSdk()) return providerSdk()!;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://static.sumsub.com/idensic/static/sns-websdk-builder.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Identity verification interface could not be loaded."));
    document.head.appendChild(script);
  });
  const sdk = providerSdk();
  if (!sdk) throw new Error("Identity verification interface unavailable.");
  return sdk;
}

/** ID photos and selfies flow DIRECTLY to the verification vendor, never to our database. */
export default function KYCVerificationPanel({ userId }: { userId: string }) {
  const [kyc, setKyc] = useState<KycRow>(null);
  const [phoneConfirmed, setPhoneConfirmed] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [phoneStep, setPhoneStep] = useState<"new" | "code">("new");
  const [consent, setConsent] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [sdkVisible, setSdkVisible] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    void refreshStatus();
    return () => { mounted.current = false; };
  }, [userId]);

  async function refreshStatus() {
    const [{ data: profile, error: profileError }, { data: auth, error: authError }] = await Promise.all([
      supabase.from("kyc_verifications").select("status,document_verified,selfie_verified").eq("user_id", userId).maybeSingle(),
      supabase.auth.getUser(),
    ]);
    if (!mounted.current) return;
    setError(profileError?.message ?? authError?.message ?? "");
    setKyc(profile ?? null);
    setPhoneConfirmed(Boolean(auth.user?.phone_confirmed_at));
  }
  async function sendPhone() {
    if (!PHONE_ENABLED) return;
    if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) { setError("Use international format, such as +15551234567."); return; }
    setWorking(true); setError(""); setMessage("");
    const { error: smsError } = await supabase.auth.updateUser({ phone: phoneNumber });
    if (smsError) setError(smsError.message);
    else { setPhoneStep("code"); setMessage("A verification code was requested. Enter it below."); }
    setWorking(false);
  }
  async function confirmPhone() {
    if (!PHONE_ENABLED) return;
    setWorking(true); setError(""); setMessage("");
    const { error: verifyError } = await supabase.auth.verifyOtp({ phone: phoneNumber, token: otp, type: "phone_change" });
    if (verifyError) setError(verifyError.message);
    else {
      await refreshStatus();
      setMessage("Phone confirmation submitted; verification status refreshed from Supabase Auth.");
      setPhoneStep("new");
      setOtp("");
    }
    setWorking(false);
  }
  async function issueToken(): Promise<string> {
    const { data, error: requestError } = await supabase.functions.invoke("kyc-start-v1", { body: { action: "start" } });
    if (requestError || typeof data?.accessToken !== "string") throw new Error(requestError?.message ?? data?.error ?? "Verification session unavailable.");
    return data.accessToken;
  }
  async function launchIdCheck() {
    if (!DOCUMENTS_ENABLED || !PRIVACY_URL || !consent) return;
    setWorking(true); setError(""); setMessage("");
    try {
      const token = await issueToken();
      const sdk = await loadProviderSdk();
      setSdkVisible(true);
      // SDK completion event is never proof of verification. Only a signed vendor
      // webhook may update the database, and phone must separately be confirmed.
      const instance = sdk.init(token, issueToken).withConf({ lang: "en" })
        .withOptions({ adaptIframeHeight: true }).build();
      instance.launch("#imperial-kyc-sdk");
      setMessage("Follow the secure provider's ID and selfie instructions. Verification may require manual review.");
    } catch (e) {
      setSdkVisible(false);
      setError(e instanceof Error ? e.message : "Unable to start identity verification.");
    } finally { setWorking(false); }
  }
  const documentVerified = kyc?.status === "verified" && kyc.document_verified === true;
  const selfieVerified = kyc?.status === "verified" && kyc.selfie_verified === true;
  const fullyVerified = documentVerified && selfieVerified && phoneConfirmed;
  return <section style={{ ...boxStyle, marginTop: 18, background: "#141B29" }} aria-label="Imperial Games identity verification">
    <h3 style={{ color: "#EACC80" }}>Identity & mobile verification</h3>
    <p style={{ color: "#C1CBDB" }}>Verify a government-issued ID, matching selfie/liveness, and mobile number. This is separate from your public player name. Never upload identity photos into chat or send them to Imperial Games staff.</p>
    <p role="status" style={{ color: fullyVerified ? "#A1E5BC" : "#F1D3A0", fontWeight: 700 }}>
      Account verification: {fullyVerified ? "FULLY VERIFIED" : "NOT FULLY VERIFIED"}
    </p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
      <div style={boxStyle}><strong>Government ID</strong><p>{documentVerified ? "Verified" : "Not verified"}</p></div>
      <div style={boxStyle}><strong>Selfie / liveness</strong><p>{selfieVerified ? "Verified" : "Not verified"}</p></div>
      <div style={boxStyle}><strong>Mobile SMS</strong><p>{phoneConfirmed ? "Verified" : "Not verified"}</p></div>
    </div>
    {kyc?.status === "pending" && <p>Document and selfie review is pending.</p>}
    {kyc?.status === "needs_review" && <p>The identity provider requested a further review or retry.</p>}
    {kyc?.status === "rejected" && <p>Identity review was rejected. Contact support for an appeal rather than resubmitting sensitive files here.</p>}
    <div style={{ marginTop: 15 }}>
      <h4 style={{ color: "#F0CB7B" }}>1. ID photo and matching selfie</h4>
      <p style={{ color: "#C1CBDB" }}>The hosted identity provider collects these images directly; we store only the verification result. A privacy notice and provider sandbox credentials are required before this becomes available.</p>
      {DOCUMENTS_ENABLED && PRIVACY_URL ? <>
        <p><a href={PRIVACY_URL} rel="noopener noreferrer" target="_blank" style={{ color: "#F1D288" }}>Read the identity-verification privacy notice ↗</a></p>
        <label><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/> I have read the privacy notice and choose to start the identity check.</label>
        <p><button type="button" style={buttonStyle} disabled={working || !consent || documentVerified} onClick={() => void launchIdCheck()}>
          {working ? "Starting secure check…" : "Start secure ID + selfie check"}
        </button></p>
      </> : <p style={{ color: "#B3BDD1" }}>ID/selfie check is not activated on this staging build.</p>}
      {sdkVisible && <div id="imperial-kyc-sdk" aria-label="Secure provider ID and selfie capture" />}
      {!sdkVisible && <div id="imperial-kyc-sdk" style={{ display: "none" }} />}
    </div>
    <div style={{ marginTop: 20 }}>
      <h4 style={{ color: "#F0CB7B" }}>2. Mobile phone verification</h4>
      {phoneConfirmed ? <p>Mobile number confirmed by Supabase Authentication.</p> :
        PHONE_ENABLED ? <div>
          <label htmlFor="kyc-phone">Mobile number in international format</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            <input id="kyc-phone" type="tel" autoComplete="tel" placeholder="+15551234567" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)}
              style={{ padding: 11, border: "1px solid #665C7A", background: "#090F19", color: "#fff", borderRadius: 8, flex: "1 1 210px" }}/>
            {phoneStep === "new" && <button type="button" disabled={working} style={buttonStyle} onClick={() => void sendPhone()}>Send SMS code</button>}
          </div>
          {phoneStep === "code" && <div style={{ marginTop: 10 }}>
            <label htmlFor="kyc-otp">Enter SMS confirmation code</label>
            <input id="kyc-otp" inputMode="numeric" autoComplete="one-time-code" value={otp} maxLength={8} onChange={e => setOtp(e.target.value)}
              style={{ display: "block", padding: 11, background: "#090F19", color: "white", marginTop: 8, borderRadius: 8 }}/>
            <button style={{ ...buttonStyle, marginTop: 8 }} disabled={working || otp.length < 4} type="button" onClick={() => void confirmPhone()}>Verify mobile code</button>
          </div>}
        </div> : <p>SMS confirmation is not activated. A Supabase SMS provider must be configured first.</p>}
    </div>
    <p><button type="button" onClick={() => void refreshStatus()} style={{ ...buttonStyle, background: "#252C3E", border: "1px solid #D9B35B", color: "#F1D288" }}>Refresh verification status</button></p>
    {error && <p role="alert" style={{ color: "#FFB4B4" }}>{error}</p>}
    {message && <p role="status" style={{ color: "#D5DEED" }}>{message}</p>}
    <small style={{ color: "#B3BDD1" }}>KYC approval never enables wagering or withdrawals automatically. Regulatory review, age/geo eligibility, sanctions checks, and provider callbacks are separate release gates.</small>
  </section>;
}
