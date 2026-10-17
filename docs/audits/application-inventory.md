# Application inventory and migration status

## Verified
- Repository includes a legacy `ig-games.zip` archive, and a Solana blueprint at `docs/blueprints/solana-casino-platform.md`.
- Root application files were not present when checked before this scaffold.

## Not yet verified
- Contents and quality of `ig-games.zip` (GitHub text connector cannot decode the binary archive).
- Existing application behavior, Base44 backend operations, game logic, payment flows, database schema, or tests.
- Existing Supabase deployment and Edge Functions.

## Scaffold scope
- Minimal React/Vite/TypeScript entrypoint and optional public-key Supabase client.
- Local Supabase CLI configuration; no deployed database changes, wallet transactions, or privileged functions.

## Next audit gates
1. Extract legacy ZIP using a binary-capable GitHub checkout/download, compare its file tree and package manifests.
2. Preserve working frontend and tests; migrate module-by-module rather than replacing the product with the scaffold.
3. Inspect Supabase SQL/RLS and Edge Functions, then implement and test atomic idempotent settlement with least privilege.
4. Run npm install, typecheck, build, and tests in CI before any merge.
5. Validate all blueprint features against actual source and produce a traceable requirements matrix.

**Warning:** Do not merge this scaffold to `main` as a replacement for the legacy application before the ZIP contents are inspected.
