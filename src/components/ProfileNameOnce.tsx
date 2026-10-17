import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function ProfileNameOnce({ userId }: { userId: string }) {
  const [savedName, setSavedName] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let alive = true;
    setPending(true);
    setSavedName(null);
    void supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data) setMessage("Unable to read your profile. Please try again.");
        else setSavedName(data.display_name || "");
        setPending(false);
      });
    return () => { alive = false; };
  }, [userId]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = draft.trim();
    if (value.length < 2 || value.length > 40 || /[<>\x00-\x1F]/.test(value)) {
      setMessage("Use a name from 2 to 40 characters without control characters or angle brackets.");
      return;
    }
    setWorking(true); setMessage("");
    const { data, error } = await supabase.from("profiles")
      .update({ display_name: value }).eq("id", userId)
      .select("display_name").single();
    if (error || !data) setMessage(error?.message ?? "Could not save name.");
    else { setSavedName(data.display_name); setMessage("Your public name has been set. It cannot be changed again by self-service."); }
    setWorking(false);
  }
  return <section style={{ border: "1px solid #504361", background: "#111827", borderRadius: 12, padding: 18, marginTop: 18 }}>
    <h3 style={{ color: "#EACC80" }}>Player display name</h3>
    <p style={{ color: "#BBC5D3" }}>Choose your public table name carefully. You can set it once; later changes require support review. Your display name is separate from the legal name used for KYC.</p>
    {pending ? <p role="status">Loading profile…</p> : savedName === null ? <p role="alert">{message}</p> :
      savedName ? <p><strong>{savedName}</strong> <span style={{ color: "#B6C0CB" }}>· Name locked</span></p> :
      <form onSubmit={e => void submit(e)}>
        <label htmlFor="ign-display-name">Choose name (2–40 characters)</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <input id="ign-display-name" value={draft} minLength={2} maxLength={40} required
            onChange={e => setDraft(e.target.value)} placeholder="Your player name"
            style={{ background: "#080E17", border: "1px solid #665C7A", borderRadius: 8, color: "white", padding: 12, flex: "1 1 220px" }}/>
          <button type="submit" disabled={working} style={{ padding: "10px 15px", background: "#D9B35B", border: 0, borderRadius: 8, color: "#111" }}>
            {working ? "Saving…" : "Set name once"}
          </button>
        </div>
      </form>}
    {message && savedName !== null && <p role="status">{message}</p>}
  </section>;
}
