// Public vendor webhook receiver; trust ONLY SHA256 HMAC signature of raw request bytes.
// Requires verify_jwt=false in supabase/config.toml. No PII/images retained in Postgres.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function constantTimeHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(a) || b.length !== a.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.toLowerCase().charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function hmac(body: Uint8Array, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, body));
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
Deno.serve(async req => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const secret = Deno.env.get("SUMSUB_WEBHOOK_SECRET");
  const levelName = Deno.env.get("SUMSUB_LEVEL_NAME");
  if (Deno.env.get("KYC_PROVIDER_READY") !== "true" || Deno.env.get("SUMSUB_SANDBOX_ONLY") !== "true" || !secret || !levelName)
    return json({ error: "Not configured" }, 503);
  if (req.headers.get("x-payload-digest-alg") !== "HMAC_SHA256_HEX") return json({ error: "Unsupported signature" }, 401);
  const sig = req.headers.get("x-payload-digest") ?? "";
  const body = new Uint8Array(await req.arrayBuffer());
  if (body.byteLength > 32768 || !constantTimeHex(sig, await hmac(body, secret))) return json({ error: "Invalid signature" }, 401);

  const data = (() => { try { return JSON.parse(new TextDecoder().decode(body)); } catch { return null; } })();
  // Never turn Sumsub's own dashboard test webhooks or production events into verified staging identities.
  if (!data || data.testMode === true || data.sandboxMode !== true || data.type !== "applicantReviewed" ||
      data.levelName !== levelName || data.reviewStatus !== "completed") return json({ ignored: true });
  if (typeof data.externalUserId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.externalUserId) ||
      typeof data.applicantId !== "string" || data.applicantId.length > 128) return json({ ignored: true });
  const answer = data.reviewResult?.reviewAnswer;
  const status = answer === "GREEN" ? "verified" :
    answer === "RED" && data.reviewResult?.reviewRejectType === "FINAL" ? "rejected" :
    answer === "RED" ? "needs_review" : null;
  if (!status) return json({ ignored: true });
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "Backend unavailable" }, 503);
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data: existing, error: readError } = await admin.from("kyc_verifications")
    .select("user_id,status,external_session_id,provider_updated_at").eq("user_id", data.externalUserId).maybeSingle();
  if (readError) return json({ error: "Record unavailable" }, 503);
  // Only a signed event corresponding to an already initiated, matching KYC application is accepted.
  if (!existing || (existing.external_session_id && existing.external_session_id !== data.applicantId)) return json({ ignored: true });
  if (existing.status === "verified") return json({ accepted: true });
  const dateStr = typeof data.createdAtMs === "string" ? data.createdAtMs.replace(" ", "T") + "Z" : "";
  const eventMs = Date.parse(dateStr);
  if (!Number.isFinite(eventMs) || eventMs > Date.now() + 5 * 60_000 || eventMs < Date.now() - 30 * 24 * 60 * 60_000)
    return json({ ignored: true });
  if (existing.provider_updated_at && new Date(existing.provider_updated_at).getTime() >= eventMs) return json({ accepted: true });

  // GREEN is valid only for configured Sumsub level requiring IDENTITY and SELFIE; verify
  // sandbox level configuration directly before activating the provider in production.
  const { error: writeError } = await admin.from("kyc_verifications").update({
    external_session_id: data.applicantId,
    status,
    document_verified: status === "verified",
    selfie_verified: status === "verified",
    provider_updated_at: new Date(eventMs).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("user_id", data.externalUserId).in("status", ["pending", "needs_review", "rejected"]);
  if (writeError) return json({ error: "Unable to update status" }, 503);
  return json({ accepted: true });
});
