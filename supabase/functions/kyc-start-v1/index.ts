// KYC provider token issuance. NO ID documents, selfies or OTPs handled here.
// Disabled unless configured with a supported, approved Sumsub SANDBOX account.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
const headersFor = (origin: string) => ({
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Vary": "Origin",
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});
function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function sumsubSignature(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}
Deno.serve(async req => {
  const origin = req.headers.get("origin") ?? "";
  const trusted = (Deno.env.get("KYC_ALLOWED_ORIGINS") ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const allowed = trusted.includes(origin);
  // Do not expose short-lived tokens to arbitrary website origins.
  if (!allowed) return new Response(null, { status: 403 });
  const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: headersFor(origin) });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headersFor(origin) });
  if (req.method !== "POST") return respond({ error: "POST required" }, 405);
  if (Deno.env.get("KYC_PROVIDER_READY") !== "true") return respond({ error: "Identity verification has not been activated." }, 503);
  const appToken = Deno.env.get("SUMSUB_APP_TOKEN");
  const appSecret = Deno.env.get("SUMSUB_SECRET_KEY");
  const levelName = Deno.env.get("SUMSUB_LEVEL_NAME");
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!appToken || !appSecret || !levelName || !url || !anon || !service || Deno.env.get("SUMSUB_SANDBOX_ONLY") !== "true")
    return respond({ error: "Identity provider sandbox is not configured." }, 503);

  const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) return respond({ error: "Authentication required" }, 401);
  const auth = createClient(url, anon, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await auth.auth.getUser(jwt);
  if (authError || !user || !user.email_confirmed_at) return respond({ error: "A confirmed login is required" }, 401);
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: existing, error: readError } = await admin.from("kyc_verifications")
    .select("status,updated_at").eq("user_id", user.id).maybeSingle();
  if (readError) return respond({ error: "Unable to check existing verification." }, 503);
  if (existing?.status === "verified") return respond({ error: "Document and selfie have already been verified." }, 409);
  // Basic issuance throttle; production should also use a stronger per-user/IP abuse-control layer.
  if (existing?.updated_at && Date.now() - new Date(existing.updated_at).getTime() < 30_000)
    return respond({ error: "Please wait before requesting another session." }, 429);

  const path = "/resources/accessTokens/sdk";
  const payload = JSON.stringify({ userId: user.id, levelName, ttlInSecs: 600 });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await sumsubSignature(appSecret, timestamp + "POST" + path + payload);
  let providerResponse: Response;
  try {
    providerResponse = await fetch("https://api.sumsub.com" + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-App-Token": appToken,
        "X-App-Access-Ts": timestamp,
        "X-App-Access-Sig": signature,
      },
      body: payload,
    });
  } catch { return respond({ error: "Identity service is temporarily unavailable." }, 503); }
  if (!providerResponse.ok) return respond({ error: "Identity service refused the session. Try again later." }, 503);
  const session = await providerResponse.json().catch(() => null);
  if (!session || typeof session.token !== "string" || session.token.length > 1024 || session.userId !== user.id)
    return respond({ error: "Invalid identity service session." }, 503);

  const now = new Date().toISOString();
  const { error: writeError } = await admin.from("kyc_verifications").upsert({
    user_id: user.id,
    provider: "sumsub",
    status: "pending",
    document_verified: false,
    selfie_verified: false,
    updated_at: now,
  }, { onConflict: "user_id" });
  if (writeError) return respond({ error: "Unable to initialize KYC status." }, 503);
  return respond({ accessToken: session.token, expiresInSeconds: 600, mode: "sandbox" });
});
