# Original Imperial Games frontend: staged Supabase migration

This folder is an **overlay**, applied in CI after extracting the original 390-entry casino ZIP. It does not delete the original source or replace the production website.

## What this stage does

- Uses Supabase Auth sessions, profile exclusion checks, and canonical user_roles.
- Preserves the original React/Vite page structure and assets in a separate preview build.
- Offers authenticated, owner-scoped read-only wallet and transaction views.
- Supports a one-time display_name update through existing database restrictions.
- Rejects legacy writes, privileged entity listings, payments, game actions, uploads, and unconverted functions instead of silently rerouting them.
- Blocks sensitive game/KYC/admin/withdrawal routes in the migration preview.
- Removes Base44 from the preview Vite config and client authentication path.

## Build

CI job: `migrated-legacy-preview`. Runs from `ig-games.zip`, copies `migration/legacy-overlay/src`, replaces the Vite config, runs `patch-app.mjs`, installs the Supabase JavaScript client, and builds. **Never publish this partial preview in place of the full casino.**

## Not done

A successful bundle is not authenticated browser E2E. Legacy business features still reference the temporary compatibility name `base44`, and most features remain disabled; the name is retained solely to avoid wholesale UI replacement. Backend settlement, wallet transfers, deposits, payouts, slots, staking, sweepstakes, KYC and administrative actions require individually reviewed Supabase operations. The older ZIP also includes direct SDK references in server-function source that are not migrated by the preview adapter.

Before any release, complete feature-by-feature migration, migrate the original frontend into first-class version-controlled source, pass real browser and concurrency/security tests, and complete independent legal and payments reviews.

No unverified Cloudflare deployment, token transactions or Sumsub ID uploads.
