# Imperial Games

React + TypeScript + Vite application with optional Supabase authentication and three free-play demo games.

## Local development

Requires Node.js 20 or later.

```bash
npm install
npm run typecheck
npm run build
npm run test
npm run dev
```

Copy `.env.example` to `.env.local` and fill in the Supabase project URL and public anon/publishable key. Never expose a service-role key in a Vite environment variable. Configure email confirmations and authorized redirect URLs in Supabase Auth.

## Scope and security

The app currently provides a demo lobby, games, and authentication UI. It is **not** a real-money casino, and no payment, redeemable wallet, game settlement, admin authorization, or blockchain operations are implemented. All game outcomes are client-side demonstrations and must never be used for financial settlement. The demo randomness is not certified or uniformly sampled for gambling use.

Before production launch: add server-authoritative game settlement and an immutable double-entry ledger, database RLS policies and role checks, idempotent payment processing, identity/compliance controls, end-to-end tests, monitoring, deployment configuration, and independent security review.

## Status

Build and tests must pass in CI before considering a merge into `main`.

## Staging connection

The browser client defaults to the Imperial Games staging Supabase project using a public publishable key. Override via `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for a different environment. Supabase Auth email confirmation and allowed redirect URLs must be configured for the deployed domain. No secret credentials are committed.
