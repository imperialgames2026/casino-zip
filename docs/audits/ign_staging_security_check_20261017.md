# IGN staging security check — 2026-10-17

## Scope
React read-only IGN Wallet and Royal Treasury, Supabase staging permissions, four tester accounts, one-time player name, staged Sumsub KYC. Review performed on integration/app-scaffold-audit, not main.

## Verified in staging database
- All four registered tester accounts returned the `tester` role through their own authenticated RLS context; each could read only its own `public.user_roles` row.
- None of the four tester contexts returned true from `public.is_admin()` or `public.is_superadmin()`.
- One-time name setup permitted a previously blank `display_name`, trimmed input, and blocked subsequent self-service name changes.
- A tester was denied attempts to modify `full_name` or update `user_roles`. All simulated mutations used ROLLBACK.
- Main poker action/settlement RPC functions and the `secure_wallet_operation` RPC are not executable by `authenticated` or `anon` database roles.
- `public.kyc_verifications` has RLS with owner-only read, no authenticated write policy.
- The production-like game backend has other mutation surfaces and has not received a complete independent security review.

## Code committed, but NOT endpoint-verified
- Added `user_roles` tester-deny checks to `poker-events-v1`, `poker-table-v1`, and `provably-fair-v2` Edge Function source. These require redeployment and authenticated HTTP checks; updating GitHub does not change deployed functions.
- Added regression assertions in `tests/ign-readonly-endpoints.test.js`.
- Existing `src/lib/ign/` unit tests cover BigInt precision, selected Devnet RPC responses and Superadmin role checks, but a passing current CI run is not available.
- No authenticated browser E2E, Phantom extension test, live Devnet RPC browser access test, or provider Sumsub sandbox end-to-end evidence has been obtained.
- GitHub Actions query returned no workflow runs/check statuses on the reviewed commits. Source changes alone are not a verified successful build.

## KYC gate
- Sumsub chosen for ID and selfie/liveness. Frontend feature flags default off; no real collection until verified provider configuration.
- The drafted Sumsub webhook needs verified applicant-session binding, vendor event-format validation, replay/idempotency and evidence that required document + liveness steps passed. Never trust a single unverified field to issue `verified`.
- Phone SMS remains disabled until Supabase Auth SMS provider configured.
- Do not expose sensitive identity documents in application SQL, GitHub, or support chats.

## Cloudflare decision
- No Cloudflare Worker is required for current Sumsub or authenticated gameplay. Supabase Edge Functions remain the single server implementation.
- Consider Cloudflare Pages for React static frontend, WAF/Turnstile/rate limiting for public abuse, and only later a Worker for centralized Devnet RPC throttling/caching if browser RPC rate limits justify it.
- Web edge protection is not a replacement for RLS, Auth or game settlement validation.

## Blockers before main merge
1. Verify current CI and resolve any TypeScript/build/test failures.
2. Redeploy tested Edge Function updates to staging only.
3. Authenticated tester/Admin/Superadmin browser and HTTP scenarios.
4. Verify Sumsub provider webhook handshake in sandbox before enabling flags.
5. Independent review for financial/game settlement and legal controls.
