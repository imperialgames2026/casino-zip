# Test the Imperial Games Poker staging lobby

**Status (2026-10-17):** Edge Functions and database migrations deployed in `imperial-games-staging` (`qonqemhljgxlwpghkxhn`). React changes committed on `integration/app-scaffold-audit`; **frontend has not been deployed**. No real-money chips, financial wallets, redemption, rake, or prizes.

## Required setup

1. Two distinct registered Supabase Auth users (one to create an event, another to join as player; both may join the same event).
2. An explicitly approved **Superadmin account** with a row in `public.user_roles`. There are no Superadmin roles currently assigned on staging. The account owner must choose which email receives the role. From the Supabase SQL Editor, after verifying the intended identity:

```sql
insert into public.user_roles (user_id,role)
select id,'superadmin' from auth.users where lower(email)=lower('REPLACE_WITH_YOUR_TEST_EMAIL')
on conflict (user_id) do update set role=excluded.role;
```

3. Clone the integration branch and configure the public Supabase client key (never put `service_role` in the browser):

```bash
git clone --branch integration/app-scaffold-audit https://github.com/imperialgames2026/casino-zip.git
cd casino-zip
cat > .env.local <<'ENV'
VITE_SUPABASE_URL=https://qonqemhljgxlwpghkxhn.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_STAGING_PUBLISHABLE_OR_ANON_KEY
ENV
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

Find the public/publishable key in the Supabase project dashboard's API settings. Only proceed to browser tests if the commands pass.

## Two-player Sit & Go test

1. In browser A, sign in as designated Superadmin. Open **Admin** -> **Poker Event Builder**. Choose Sit & Go, 2 seats, 2 maximum players, 1,000 practice chips, blinds 5/10 and a 10-minute level; create draft.
2. Click **Refresh drafts**, then **Publish registration**.
3. In browser A, open **Games** -> **Online Poker**, and register. In an independent incognito window or another browser, sign in as player B and register for the same event. Each account needs a distinct Supabase Auth user.
4. Superadmin returns to **Admin** -> **Refresh drafts** and clicks **Seat players & start**. A full Sit & Go won't start until all seats are registered.
5. Both players open **Games** -> **Online Poker** -> **Open my table**. The assigned table owner clicks **Deal next hand**. Only your own hole cards should appear in the snapshot.
6. The player whose seat matches **Turn** can check, call, fold, raise, or go all-in. Use **Reconnect / refresh snapshot** after closing/reopening a browser tab to confirm the server retains turn, stacks, and cards.
7. When a street completes, click **Deal next street**; after river showdown, click **Settle showdown**. After a hand ends, click **Process eliminations / balance seats**, then the owner deals the next hand.
8. If a player loses all practice chips, process eliminations; if only one remains, the event should become `finished`.

For scheduled MTTs, use a future scheduled time. **Seat players & start** is manual and prohibited before the scheduled time. With more than six players, tables are created in groups of up to six; table balancing is restricted to between hands. No unattended schedule runner exists yet.

For ring tables, this build supports an initial fixed practice stack and repeated hands; **cash buy-in, top-up, cash-out, and rake are not implemented**.

## Security/regression verification

The committed SQL test `supabase/tests/poker_event_smoke.sql` checks registration, hand start, action replay, chip conservation and dealer rotation using two Auth accounts. It runs inside `BEGIN ... ROLLBACK` and does not leave test data. A separate two-request concurrency test was run on staging: one action accepted, one rejected, one action row committed, and a 2,000-chip invariant preserved.

The `poker-table-v1` Edge Function uses Supabase Auth; only seated users can request private snapshots, and undisclosed deck/seed are withheld until the hand is complete. A cryptographic seed commitment is checked before each hand and the deck is HMAC-shuffled deterministically. Use separate real sessions to check permissions, hidden cards, and reconnect behavior.

## Not yet verified / not production-ready

- CI TypeScript, Vitest, build status on the latest commit has **not** been confirmed.
- Authenticated full browser E2E across two separate accounts has **not** been performed.
- Comprehensive multi-table balancing under concurrent actions, long-run game logs, timeouts and automatic player actions need testing.
- Game rules still need exhaustive edge-case review (side pots, short all-in raises, split pots, odd chips, dead blinds, tournament ante).
- Automated scheduled starts, late registration, disconnect timeouts and blind-clock background jobs are not implemented.
- Provably fair complete-hand postmortem replay and independent security audit remain required.
- Sweepstakes/financial compliance, real-value settlement and production deployment are disabled.

Do not merge into `main` or activate real-value play without a clean CI and live session test.
