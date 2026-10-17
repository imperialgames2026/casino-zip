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
