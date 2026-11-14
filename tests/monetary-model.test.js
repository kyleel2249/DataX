const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const html = fs.readFileSync("index.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const migration = fs.readFileSync("migrations/0002_dtx_money_and_redemption.sql", "utf8");

test("Cash & Reserves is reachable from the primary navigation", () => {
  assert.match(html, /data-view="cash"/);
  assert.match(html, /id="view-cash"/);
  assert.match(html, /id="redeemButton"/);
  assert.match(html, /id="fundReserveButton"/);
});

test("DTX has a published GHS reference rate and visible redemption fee", () => {
  assert.match(html, /1 DTX = GH₵ 1\.00/);
  assert.match(html, /Redemption fee \(1%\)/);
});

test("new DTX issuance is blocked unless reserve covers existing and new supply", () => {
  assert.match(app, /state\.reserveCash<state\.tokens\+amount/);
});

test("cash redemption and market buyback require full reserve coverage", () => {
  assert.ok((app.match(/state\.reserveCash<state\.tokens/g) || []).length >= 2);
  assert.match(app, /state\.tokens-=amount;state\.reserveCash-=net;state\.cash\+=net/);
});

test("the database keeps live redemption disabled until explicitly enabled", () => {
  assert.match(migration, /redemption_enabled INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS fiat_reserve_accounts/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS dtx_redemption_requests/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS fiat_payouts/);
});

test("financial operations have idempotency keys and explicit settlement states", () => {
  assert.match(migration, /idempotency_key TEXT NOT NULL UNIQUE/);
  assert.match(migration, /'requested','reserved','approved','processing','paid','rejected','cancelled','failed'/);
  assert.match(migration, /'queued','submitted','confirmed','failed','reversed'/);
});

test("PWA install and offline shell are present", () => {
  const manifest = fs.readFileSync("manifest.webmanifest", "utf8");
  const worker = fs.readFileSync("service-worker.js", "utf8");
  assert.match(html, /rel="manifest"/);
  assert.match(html, /installAppButton/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(worker, /addEventListener\("fetch"/);
});
test("Android background meter is user-started and foreground-visible", () => {
  const manifestXml = fs.readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");
  const service = fs.readFileSync("android/app/src/main/java/com/datax/app/DataXMeterService.kt", "utf8");
  const activity = fs.readFileSync("android/app/src/main/java/com/datax/app/MainActivity.kt", "utf8");
  assert.match(manifestXml, /FOREGROUND_SERVICE_SPECIAL_USE/);
  assert.match(manifestXml, /foregroundServiceType="specialUse"/);
  assert.match(service, /startForeground\(/);
  assert.match(service, /TrafficStats\.getTotalRxBytes/);
  assert.match(service, /onTaskRemoved/);
  assert.match(activity, /addJavascriptInterface/);
});
test("server account and transfer endpoints use hashed passwords and idempotent records", () => {
  const auth = fs.readFileSync("functions/_lib/auth.js", "utf8");
  const register = fs.readFileSync("functions/api/auth/register.js", "utf8");
  const transfer = fs.readFileSync("functions/api/wallet/transfer.js", "utf8");
  assert.match(auth, /PBKDF2/);
  assert.match(auth, /HttpOnly; Secure; SameSite=Strict/);
  assert.match(register, /password_hash/);
  assert.match(transfer, /idempotencyKey/);
  assert.match(transfer, /balance_atoms>=\?/);
});
