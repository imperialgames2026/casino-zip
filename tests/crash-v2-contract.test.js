import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = file => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const sql = read("supabase/migrations/20261018234308_crash_trenball_server_timed_practice_v2.sql");
const autoFix = read("supabase/migrations/20261018235300_crash_v2_prevent_early_auto_cashout_beyond_committed_result.sql");
const edge = read("supabase/functions/ig-crash-v2/index.ts");
const ui = read("src/components/CrashArena.tsx");
const app = read("src/App.tsx");

describe("Crash / Trenball staging-only contracts", () => {
  it("has server-owned queue, seeds, authoritative wall-clock settlement, and no direct browser DB access", () => {
    expect(sql).toContain("ig_crash_v2_queue");
    expect(sql).toContain("ig_crash_v2_tick");
    expect(sql).toContain("ig_crash_v2_fill_queue");
    expect(sql).toContain("ig_crash_v2_history");
    expect(sql).toContain("extensions.gen_random_bytes");
    expect(sql).toContain("interval '6 seconds'");
    expect(sql).toContain("cron.schedule");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on public.%I from public,anon,authenticated");
    expect(sql).toContain("revoke all on function public.ig_crash_v2_action");
    expect(sql).toContain("grant execute on function public.ig_crash_v2_action");
    expect(sql).not.toMatch(/grant (insert|update|delete) on public\.ig_crash_v2_\w+ to authenticated/i);
    expect(sql).toContain("Nonredeemable, nontransferable");
  });
  it("supports atomic idempotent manual and automatic cashouts, and shared colors", () => {
    expect(sql).toContain("cashout_request uuid unique");
    expect(sql).toContain("request_id uuid not null unique");
    for (const mode of ["crash_manual", "crash_auto", "tren_red", "tren_green", "tren_yellow"])
      expect(sql).toContain(mode);
    expect(sql).toContain("if old.user_id<>p_actor");
    expect(sql).toContain("cashout_request=p_request");
    expect(sql).toContain("v.crash_point");
    expect(sql).toContain("paid_units=paid");
    expect(autoFix).toContain("target<=x and target<=v.crash_point");
  });
  it("requires auth, validated inputs, immutable staging target, and backend actor identity", () => {
    expect(edge).toContain("const PROJECT = \"qonqemhljgxlwpghkxhn\"");
    expect(edge).toContain("client.auth.getUser(token)");
    expect(edge).toContain("p_actor: user.id");
    expect(edge).toContain("user.is_anonymous");
    expect(edge).toContain("actions = new Set");
    expect(edge).toContain("Object.keys(body).some");
    expect(edge).toContain("ig_crash_v2_state");
    expect(edge).toContain("ig_crash_v2_action");
    expect(edge).not.toContain("p_actor: body.");
    expect(edge).not.toContain("secure-wallet");
  });
  it("exposes practice gameplay, no financial wallet mutation, server-authoritative controls", () => {
    expect(app).toContain("<CrashArena signedIn=");
    expect(ui).toContain("ig-crash-v2");
    expect(ui).toContain("Cash out at live multiplier");
    expect(ui).toContain("Trenball");
    expect(ui).toContain("Verify last round");
    expect(ui).toContain("FREE PLAY ONLY");
    expect(ui).not.toContain(".from(\"wallets\")");
    expect(ui).not.toContain("base44");
  });
});
