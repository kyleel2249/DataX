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
