import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.BROWSER_BASE_URL || 'http://127.0.0.1:4174';
const playerEmail = process.env.STAGING_TEST_EMAIL;
const playerPassword = process.env.STAGING_TEST_PASSWORD;
const testerEmail = process.env.STAGING_READONLY_TEST_EMAIL;
const testerPassword = process.env.STAGING_READONLY_TEST_PASSWORD;
if (![playerEmail, playerPassword, testerEmail, testerPassword].every(Boolean)) {
  throw new Error('Staging player and isolated tester credentials required');
}
const browser = await chromium.launch({ headless: true });
async function login(context, email, password) {
  const page = await context.newPage();
  await page.goto(base + '/');
  await page.locator('input[aria-label="Email"]').fill(email);
  await page.locator('input[aria-label="Password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForFunction(() => !document.querySelector('input[aria-label="Email"]'), { timeout: 20000 });
  assert.equal(await page.getByText('Account verification unavailable:', { exact: false }).count(), 0);
  return page;
}
async function visit(page, route, heading) {
  await page.goto(base + route, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: heading }).first().waitFor({ timeout: 20000 });
}

try {
  const tester = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const testerPage = await login(tester, testerEmail, testerPassword);
  await visit(testerPage, '/Support', 'Support Center');
  console.log('PASS browser authenticated tester Support page');

  await visit(testerPage, '/ProvablyFair', 'Provably Fair · Practice Verification');
  await testerPage.getByRole('heading', { name: 'Your revealed practice rounds' }).waitFor();
  console.log('PASS browser original ProvablyFair page');

  await visit(testerPage, '/PlayDice', 'Imperial Practice Dice');
  assert.equal(await testerPage.getByRole('button', { name: 'Roll practice dice' }).isDisabled(), true);
  console.log('PASS browser tester cannot start game rounds');

  await testerPage.goto(base + '/AdminSupport');
  await testerPage.getByText('Admin or Superadmin authorization required.').waitFor({ timeout: 15000 });
  assert.equal(await testerPage.getByText('Admin or Superadmin authorization required.').count(), 1);
  console.log('PASS browser tester denied staff support');

  await testerPage.goto(base + '/Home');
  await testerPage.locator('nav').first().waitFor({ timeout: 15000 });
  const pokerLink = testerPage.getByRole('link', { name: 'Poker', exact: true });
  if (await pokerLink.count()) {
    await pokerLink.first().click();
    await testerPage.waitForTimeout(1200);
    console.log('DEBUG route after Poker link:', new URL(testerPage.url()).pathname);
    console.log('DEBUG route guard:', JSON.stringify(await testerPage.locator('main[role="alert"]').allTextContents()));
    console.log('DEBUG visible DOM text:', JSON.stringify((await testerPage.locator('body').innerText()).slice(0,750)));
    await testerPage.getByText('This page is disabled until its operations have been migrated').waitFor({ timeout: 15000 });
    console.log('PASS browser React Router blocks old poker route after client navigation');
  }
  await tester.close();

  const player = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const playerPage = await login(player, playerEmail, playerPassword);
  await visit(playerPage, '/PlayDice', 'Imperial Practice Dice');
  const roll = playerPage.getByRole('button', { name: 'Roll practice dice' });
  assert.equal(await roll.isDisabled(), false);
  await roll.click();
  await playerPage.getByText('SHA-256 commitment and HMAC result verified').waitFor({ timeout: 25000 });
  assert.equal(await playerPage.getByText('No balance changed.').count(), 1);
  console.log('PASS browser real staging player verifies Dice practice outcome with no wager');
  await playerPage.goto(base + '/ProvablyFair');
  await playerPage.getByRole('heading', { name: 'Your revealed practice rounds' }).waitFor({ timeout: 15000 });
  await player.close();
} finally {
  await browser.close();
}
console.log('PASS original Imperial Games browser staging E2E');
