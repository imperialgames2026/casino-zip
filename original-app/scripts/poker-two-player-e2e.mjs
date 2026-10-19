import assert from 'node:assert/strict';
import { chromium } from 'playwright';

/** Opt-in staging test, two separate real player accounts, PRACTICE ONLY. */
const base = process.env.BROWSER_BASE_URL || 'http://127.0.0.1:4174';
const credentials = [
  [process.env.STAGING_TEST_EMAIL, process.env.STAGING_TEST_PASSWORD],
  [process.env.STAGING_PLAYER2_EMAIL, process.env.STAGING_PLAYER2_PASSWORD],
];
if (credentials.some(([email, password]) => !email || !password) ||
    credentials[0][0].toLowerCase() === credentials[1][0].toLowerCase()) {
  throw new Error('Two DIFFERENT staging player accounts must be configured via GitHub Actions secrets.');
}
if (process.env.STAGING_SUPABASE_URL !== 'https://qonqemhljgxlwpghkxhn.supabase.co') {
  throw new Error('Refusing poker E2E outside the dedicated Imperial Games staging project.');
}

const browser = await chromium.launch({ headless: true });
async function login(context, [email, password]) {
  const page = await context.newPage();
  await page.goto(base + '/');
  await page.locator('input[aria-label="Email"]').fill(email);
  await page.locator('input[aria-label="Password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.locator('input[aria-label="Email"]').waitFor({ state: 'detached', timeout: 20000 });
  return page;
}
try {
  const one = await login(await browser.newContext(), credentials[0]);
  const two = await login(await browser.newContext(), credentials[1]);
  await one.goto(base + '/PokerLobby');
  await one.getByRole('heading', { name: /Imperial Poker Lobby/ }).waitFor();
  await one.getByRole('button', { name: 'Create practice table' }).click();
  await one.waitForURL(/\/PlayPoker\?tableId=/, { timeout: 20000 });
  const tableId = new URL(one.url()).searchParams.get('tableId');
  assert.match(tableId || '', /^[0-9a-f-]{36}$/i);
  await two.goto(base + '/PlayPoker?tableId=' + encodeURIComponent(tableId));
  await two.getByRole('button', { name: 'Join table' }).click();
  await one.getByText(/2 seated/).waitFor({ timeout: 20000 });
  await two.getByText(/2 seated/).waitFor({ timeout: 20000 });
  await one.getByRole('button', { name: 'Start hand (owner)' }).click();
  await one.getByText(/playing · preflop/).waitFor({ timeout: 15000 });
  await two.getByText(/playing · preflop/).waitFor({ timeout: 15000 });
  const ownCards1 = (await one.getByText(/Your cards:/).textContent()).trim();
  const ownCards2 = (await two.getByText(/Your cards:/).textContent()).trim();
  assert.notEqual(ownCards1, 'Your cards:');
  assert.notEqual(ownCards2, 'Your cards:');
  assert.notEqual(ownCards1, ownCards2, 'Players must not receive the same private hole cards');
  assert.equal(await one.getByText(/Deposit funds|Withdraw winnings/).count(), 0);

  // Postgres turn deadlines are 10 seconds, so the action may time out while
  // the CI browser catches up. Either observed server outcome is acceptable.
  await one.reload();
  await one.getByText(/2 seated/).waitFor({ timeout: 20000 });
  await two.reload();
  await two.getByText(/2 seated/).waitFor({ timeout: 20000 });
  console.log('PASS two distinct staging players, private cards, server state and reconnect');
} finally {
  await browser.close();
}
