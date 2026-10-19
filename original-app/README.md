# Imperial Games — preserved original React casino, Supabase migration

This is the original 390-entry React application migrated out of the
archive into normal editable source. Original casino UI/screens/assets
are preserved. The Base44 SDK client, Vite plugin and auth provider
have been replaced by a fail-closed Supabase migration adapter.

**Preview/staging only.** Unsupported game, payments, identity capture,
staking and admin mutation flows are deliberately disabled. The
original immutable Base44 backend reference remains in ../ig-games.zip.

This source is not a production-ready casino or a financial ledger.
Review docs/audits before enabling any route. Never add signing keys.
