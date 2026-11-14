const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = path => fs.readFileSync(path, "utf8");

test("registration form has confirm-password, strength feedback and an error region", () => {
  const html = read("index.html");
  assert.match(html, /id="registerPasswordConfirm"[^>]*autocomplete="new-password"/);
  assert.match(html, /id="passwordStrength"/);
  assert.match(html, /id="passwordStrengthLabel"[^>]*aria-live="polite"/);
  assert.match(html, /id="registerStatus"[^>]*role="alert"/);
  assert.match(html, /<label for="registerPasswordConfirm">/);
});

test("registration submit sends confirmPassword, blocks double submits and shows the server error", () => {
  const app = read("app.js");
  assert.match(app, /confirmPassword:confirmPassword/);
  assert.match(app, /if\(submit\.disabled\) return;/);
  assert.match(app, /showStatus\(error\.message\)/);
  assert.match(app, /finally \{ submit\.disabled=false/);
});

test("sandbox state is not seeded with sample events or balances", () => {
  const app = read("app.js");
  const initial = app.slice(app.indexOf("const initialState"), app.indexOf("const sanitizeState") > 0 ? app.indexOf("// Repair any stored state") : undefined);
  assert.ok(!/BAL-0001\d\d/.test(initial), "seeded sample events remain");
  assert.match(initial, /events:\[\]/);
  assert.match(initial, /tokens:0,cash:0/);
  assert.match(app, /STORAGE_KEY = "datax-sandbox-v2"/);
  assert.match(app, /removeItem\(LEGACY_STORAGE_KEY\)/);
});

test("static markup carries no fabricated balances or trend figures", () => {
  const html = read("index.html");
  for (const fake of ["24.80", "42.50", "12.00 DTX", "17.36", "8.4%", "Demo account"]) {
    assert.ok(!html.includes(fake), `index.html still contains ${fake}`);
  }
});

test("profile card shows the signed-in account instead of a fixed name", () => {
  assert.match(read("index.html"), /id="profileName"/);
  assert.match(read("app.js"), /pName\.textContent=label/);
});
