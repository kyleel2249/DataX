const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = path => fs.readFileSync(path, "utf8");

test("every script index.html loads is copied into dist and precached", () => {
  const html = read("index.html");
  const build = read("scripts/build.mjs");
  const worker = read("service-worker.js");
  const scripts = [...html.matchAll(/<script src="\.\/([^"]+)"/g)].map(match => match[1]);
  assert.ok(scripts.includes("bandwidth-account.js") && scripts.includes("admin-console.js"));
  for (const script of scripts) {
    assert.ok(build.includes(`"${script}"`), `${script} missing from build rootFiles`);
    assert.ok(worker.includes(`./${script}`), `${script} missing from service worker shell`);
  }
});

test("password hashing stays within the Cloudflare Workers PBKDF2 limit", () => {
  const auth = read("functions/_lib/auth.js");
  assert.match(auth, /PBKDF2_ITERATIONS = 100000/);
  assert.ok(!auth.includes("310000"));
  assert.match(auth, /safeEqual\(actual, expected\)/);
});

test("sign-in and registration are throttled and hide account existence", () => {
  assert.match(read("functions/api/auth/login.js"), /dummyVerify/);
  assert.match(read("functions/api/auth/login.js"), /rateLimit\(/);
  assert.match(read("functions/api/auth/register.js"), /rateLimit\(/);
  assert.match(read("migrations/0005_auth_rate_limits.sql"), /CREATE TABLE IF NOT EXISTS auth_rate_limits/);
});

test("redemption moves the reserve while the request is still 'requested'", () => {
  const source = read("functions/api/redemptions/request.js");
  assert.match(source, /UPDATE fiat_reserve_accounts[^"]*status='requested'/);
  assert.ok(!/UPDATE fiat_reserve_accounts[^"]*status='reserved'/.test(source));
  assert.match(source, /SET status='reserved' WHERE id=\? AND status='requested' AND changes\(\)=1/);
});

test("review console and bandwidth records honour the configured API address", () => {
  assert.match(read("admin-console.js"), /datax-api-base-url/);
  assert.match(read("bandwidth-account.js"), /toISOString/);
});

test("security headers include a content security policy", () => {
  const headers = read("_headers");
  assert.match(headers, /Content-Security-Policy:.*script-src 'self'/);
  assert.match(headers, /frame-ancestors 'none'/);
});
