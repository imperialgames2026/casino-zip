import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// Inventory generated from the preserved original ZIP, not from the scaffold.
// This file records mappings; it never executes the old Base44 backend code.
const root = resolve(process.argv[2] || ".");
const output = resolve(process.argv[3] || "legacy-functions-inventory.json");
function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? filesUnder(join(directory, entry.name)) : [join(directory, entry.name)]);
}
const backend = filesUnder(join(root, "base44", "functions"))
  .filter(path => path.endsWith("/entry.ts"));
const frontend = filesUnder(join(root, "src"))
  .filter(path => /\.(jsx?|tsx?)$/.test(path) && !path.includes("/functions/"));
const calls = new Map();
const entityCalls = new Map();
for (const path of frontend) {
  const source = readFileSync(path, "utf8");
  for (const m of source.matchAll(/base44\.functions\.invoke\(\s*(['"])([^'"]+)\1/g))
    calls.set(m[2], (calls.get(m[2]) || 0) + 1);
  for (const m of source.matchAll(/base44\.entities\.([A-Za-z_]\w*)\.([A-Za-z_]\w*)/g)) {
    const op = m[1] + "." + m[2];
    entityCalls.set(op, (entityCalls.get(op) || 0) + 1);
  }
}
function area(name) {
  if (/^(?:getWeeklyTokenLeaderboard|getStakingDashboard|getEcosystemTransparency|getCrashRound)$/.test(name)) return "read-only reporting";
  if (/^(?:admin|superadmin)/i.test(name)) return "privileged administration";
  if (/(?:wallet|stake|withdraw|rakeback|referralBonus|checkout|payment|ledger|gift|purchase)/i.test(name)) return "financial and wallet";
  if (/(?:generate|blackjack|crash|poker|deal|randomness|bombPot)/i.test(name)) return "game and outcome";
  if (/(?:quest|achievement|reward|vip|weekly|bonus)/i.test(name)) return "progression and rewards";
  return "identity, support or operations";
}
const mapped = {
  getWeeklyTokenLeaderboard: "read-only migrated to legacy-leaderboard-v1 (CENT only)",
  initializeUserIdentity: "client adapter: existing identity verified, no auto username or account number",
  updateUsername: "client adapter: one-time display_name using DB lock",
};
const functions = backend.map(path => {
  const name = path.split("/").at(-2);
  const source = readFileSync(path, "utf8");
  return {
    legacy_name: name, category: area(name),
    original_file: relative(root, path),
    frontend_calls: calls.get(name) || 0,
    implemented: mapped[name] || "not migrated — server feature gated",
    backend_uses_service_role: /asServiceRole/.test(source),
  };
}).sort((a,b)=>a.category.localeCompare(b.category)||a.legacy_name.localeCompare(b.legacy_name));
const unmappedCalls = [...calls].filter(([name]) => !functions.some(f => f.legacy_name === name)).map(([name, count]) => ({ name, count }));
const result = {
  generated_from: "preserved ig-games.zip",
  backend_function_count: functions.length,
  frontend_function_call_sites: [...calls.values()].reduce((a,b)=>a+b,0),
  frontend_entity_operations: Object.fromEntries([...entityCalls].sort((a,b)=>b[1]-a[1])),
  unmapped_frontend_function_names: unmappedCalls,
  functions,
};
if (functions.length < 50) throw new Error("Archive function inventory unexpectedly incomplete");
writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.log("Audited", functions.length, "legacy Base44 backend functions;", [...entityCalls.values()].reduce((a,b)=>a+b,0), "entity call sites;");
console.log("Unmapped frontend invocation names:", unmappedCalls.length);
