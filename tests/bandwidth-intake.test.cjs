const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const endpoint = fs.readFileSync("functions/api/bandwidth/events.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const client = fs.readFileSync("bandwidth-account.js", "utf8");

test("authenticated bandwidth intake only creates pending, zero-eligible records", () => {
  assert.match(endpoint, /requireUser\(request, env\)/);
  assert.match(endpoint, /verification_status, evidence_hash, idempotency_key/);
  assert.match(endpoint, /eligible_bytes,session_started_at,session_ended_at,verification_status/);
  assert.match(endpoint, /VALUES \(\?,\?,\?,\?,\?,\?,0,\?,\?,'pending',NULL,\?\)/);
  assert.match(endpoint, /No reward or DTX has been issued/);
});

test("bandwidth intake validates source, bytes, dates and idempotency", () => {
  assert.match(endpoint, /shared_bandwidth.*data_entitlement.*voucher/);
  assert.match(endpoint, /Number\.isSafeInteger/);
  assert.match(endpoint, /idempotencyKey\.length < 12/);
  assert.match(endpoint, /Date\.parse\(endedAt\) <= Date\.parse\(startedAt\)/);
});

test("members can submit and refresh their own D1 bandwidth records", () => {
  assert.match(html, /id="bandwidthSubmissionForm"/);
  assert.match(html, /id="bandwidthRecordsBody"/);
  assert.match(html, /id="bandwidthConsent"/);
  assert.match(html, /bandwidth-account\.js/);
  assert.match(client, /\/api\/bandwidth\/events/);
  assert.match(client, /credentials: "include"/);
});
