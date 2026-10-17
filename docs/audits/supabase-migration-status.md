# Base44 to Supabase migration status
## Source inventory
The legacy ZIP contains `src/api/base44Client.js`, `src/lib/AuthContext.jsx`, and many `base44/functions/*/entry.ts` handlers. The current scaffold branch is **not** a fully migrated app.

## Implemented on this branch
- Optional Supabase client initialized from public Vite environment variables.
- Explicit Supabase auth helpers for verified current user, sign-out, and exclusion-aware profile lookup.
- SQL baseline for profiles, separated GC/SC wallets and append-only transaction entries; RLS denies client balance mutation.
- Static contract tests for SQL security controls.

## Not implemented / release blockers
- Importing and preserving the original React application and all dependencies.
- Replacing every Base44 SDK call and backend function.
- Atomic financial transaction RPC/Edge Function, settlement, payouts, idempotency under concurrency.
- Admin-role and excluded-account enforcement at all server-side entry points.
- Applying SQL against a test Supabase instance and running integration tests.
- Reproducible build and deployment verification.

**Do not deploy or merge this branch as production.** No real financial transactions should use the placeholder scaffold.

## IGN read-only feature (integration branch; not deployed)

- Added `src/lib/ign` Devnet SPL mint registry, bigint-safe supply formatting and public RPC read-only token account queries (no wallet secrets or payments).
- Added `IGNWalletPanel` to the Wallet page and `IGNTreasuryPanel` to the Admin page. Royal Treasury uses authenticated `public.user_roles` Superadmin access checks. Staging `user_roles` was separately observed to have RLS enabled with a self-read policy on 2026-10-17.
- The approved 10-billion-token distribution is a **working budget model**, not a set of transferred on-chain balances. Treasury registration, multisig, transfers, actual circulating supply, token prices, vesting and private treasury DB tables are not implemented.
- Added source-level Vitest coverage for allocation precision, mocked Devnet balance/RPC behavior and deny-by-default role checks. GitHub CI completion and real browser/Phantom/RPC end-to-end behavior must still be verified. Existing Poker staging behavior was not changed by these panels.

## Update: original application migration tranche 1 — 2026-10-17

**Source inventory:** The original `ig-games.zip` contains 390 entries, including 270 JSX/TSX modules, 23 Base44 entity definitions, and 61 Base44 function entrypoints. Its separate locked-dependency CI build passes.

**Implemented on the integration branch:**
- `migration/legacy-overlay/` builds the original app with a Supabase client/auth provider and Base44-free Vite config, without deleting or replacing the original source.
- The temporary legacy-facing import `src/api/base44Client.js` is a fail-closed Supabase adapter. Signed-in identity comes from `auth.getUser()`, then owner-scoped profile and canonical `user_roles` checks. This import name does not mean the Base44 SDK is still being called.
- Only authenticated own-wallet/own-transaction reads and the one-time display-name operation have targeted mappings. Unmigrated legacy writes, sensitive uploads, admin listings, and functions reject explicitly.
- The original app's exclusion catch is changed to fail closed; its migration preview blocks gameplay, money movements, identity capture and admin routes. This is a **migration preview only**, not a finished casino.
- CI now independently builds (1) unchanged original ZIP, (2) root scaffold, and (3) original ZIP with Supabase overlay.
- Staging game functions `poker-events-v1` v5, `poker-table-v1` v9, and `provably-fair-v2` v4 are active with JWT verification, exclusion checks, recognized-role checks and read-only tester denial. Verified deployed source matches GitHub.
- `scripts/staging-readonly-e2e.ts` and an opt-in `readonly-auth-e2e` GitHub Actions job check authenticated tester isolation, read-only practice listing and expected HTTP 403 game-operation denials. The test is **not yet executed**; GitHub environment secrets must supply an actual Tester login.

**Remaining release gates:** finish the legacy entity/function and admin feature migration, guarantee all game and ledger operations are server-authoritative and idempotent, complete verified Sumsub sandbox integration and legal/privacy checks, run authenticated E2E browser flows, concurrency/replay/recovery tests and independent security review. Keep draft PR unmerged and live Cloudflare unchanged.

**Do not interpret a passing migration-preview bundle as financial or production readiness.**
