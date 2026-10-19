import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const table = read('original-app/src/pages/PlayPoker.jsx');
const lobby = read('original-app/src/pages/PokerLobby.jsx');
const transport = read('original-app/src/lib/practicePoker.js');
const events = read('original-app/src/lib/practicePokerEvents.js');
const app = read('original-app/src/App.jsx');

describe('Original casino practice poker Base44 migration', () => {
  it('uses only authenticated Supabase functions for poker actions and event registration', () => {
    expect(transport).toContain("functions.invoke('poker-table-v1'");
    expect(events).toContain("functions.invoke('poker-events-v1'");
    expect(transport).toContain('actionId');
    expect(transport).toContain('version: expectedVersion');
    for (const source of [transport, events, table, lobby]) {
      expect(source).not.toMatch(/@base44\/sdk|base44\.entities|UserWallet\.update|Transaction\.create/);
      expect(source).not.toMatch(/SERVICE_ROLE_KEY|service_role/);
    }
  });
  it('gates all betting on the actual database status and uses server controlled showdown', () => {
    expect(table).toContain("t.status !== 'playing'");
    expect(table).toContain("t.status === 'showdown'");
    expect(table).toContain("practicePoker.advance(tableId)");
    expect(table).toContain("practicePoker.settle(tableId)");
    expect(table).toContain("crypto.randomUUID()");
    expect(table).not.toContain('Math.random()');
  });
  it('exposes only practice poker routes and never unlocks unmigrated real-money games', () => {
    expect(app).toContain("'/PlayPoker'");
    expect(app).toContain("'/PokerLobby'");
    expect(app).toContain("!approvedRoutes.has(currentRoute)");
    expect(app).not.toContain("'/Withdraw',");
    expect(app).not.toContain("'/PlaySlots',");
    expect(lobby).toContain('no deposits, entry fees, prizes, or cash-outs');
  });
});
