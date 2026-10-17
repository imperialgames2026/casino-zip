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
