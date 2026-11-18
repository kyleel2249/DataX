const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const route = fs.readFileSync("functions/api/integrations/eti/summary.js", "utf8");
const migration = fs.readFileSync("migrations/0006_eti_integration_nonces.sql", "utf8");

test("ETI export is a read-only signed service endpoint with replay protection", () => {
  assert.match(route, /x-datax-timestamp/);
  assert.match(route, /x-datax-nonce/);
  assert.match(route, /x-datax-signature/);
  assert.match(route, /HMAC/);
  assert.match(route, /INSERT INTO integration_request_nonces/);
  assert.match(route, /MAX_CLOCK_SKEW_SECONDS = 60/);
  assert.match(migration, /nonce TEXT PRIMARY KEY/);
});

test("ETI export contains aggregates only and excludes direct member identifiers", () => {
  assert.match(route, /verified_eligible_bytes/);
  assert.match(route, /gross_revenue_minor/);
  assert.match(route, /verified_available_minor/);
  assert.match(route, /tradingCapitalEligible: false/);
  assert.doesNotMatch(route, /SELECT\s+.*email|payout_destination_hash|recipient_user_id/i);
});

test("ETI integration does not create DTX-to-trading transfer or redemption paths", () => {
  assert.doesNotMatch(route, /INSERT INTO wallet_accounts|UPDATE wallet_accounts|INSERT INTO dtx_redemption_requests/i);
  assert.match(route, /not proof of cash settlement or token backing/);
});
