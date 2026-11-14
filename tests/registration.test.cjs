const test = require("node:test");
const assert = require("node:assert/strict");

// Minimal in-memory D1 double that supports exactly the statements register.js
// issues, with atomic batch semantics (roll back everything on failure).
function fakeDb({ failOn } = {}) {
  const tables = { users: [], wallet_accounts: [], auth_sessions: [] };
  const prepare = sql => ({
    bind: (...args) => ({
      sql, args,
      first: async () => {
        if (/FROM users WHERE email/.test(sql)) return tables.users.find(u => u.email === args[0]) || null;
        return null; // rate-limit RETURNING -> fail open
      },
      run: async () => apply(sql, args, tables)
    })
  });
  function apply(sql, args, t) {
    if (failOn && failOn.test(sql)) throw new Error("no such column: password_hash");
    if (/INSERT INTO users/.test(sql)) {
      if (t.users.some(u => u.email === args[1])) throw new Error("UNIQUE constraint failed: users.email");
      t.users.push({ id: args[0], email: args[1], display_name: args[2], password_hash: args[3] });
    } else if (/INSERT INTO wallet_accounts/.test(sql)) {
      t.wallet_accounts.push({ id: args[0], user_id: args[1], balance_atoms: 0 });
    } else if (/INSERT INTO auth_sessions/.test(sql)) {
      t.auth_sessions.push({ id: args[0], user_id: args[1], token_hash: args[2] });
    }
  }
  return {
    tables,
    prepare,
    batch: async statements => {
      const snapshot = JSON.stringify(tables);
      try { for (const s of statements) apply(s.sql, s.args, tables); }
      catch (e) { const s = JSON.parse(snapshot); for (const k of Object.keys(tables)) tables[k] = s[k]; throw e; }
    }
  };
}

async function register(db, payload) {
  const { onRequestPost } = await import("../functions/api/auth/register.js");
  const request = new Request("https://datax.test/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", "CF-Connecting-IP": "203.0.113.9" },
    body: JSON.stringify(payload)
  });
  const response = await onRequestPost({ request, env: { DATA_DB: db } });
  return { response, body: await response.json() };
}

const good = { name: "Ama Mensah", email: "Ama@Example.com", password: "correct horse battery" };

test("successful registration creates one user, one DTX wallet and one session for the same user", async () => {
  const db = fakeDb();
  const { response, body } = await register(db, good);
  assert.equal(response.status, 201);
  assert.equal(db.tables.users.length, 1);
  assert.equal(db.tables.wallet_accounts.length, 1);
  assert.equal(db.tables.auth_sessions.length, 1);
  const id = db.tables.users[0].id;
  assert.equal(db.tables.wallet_accounts[0].user_id, id);
  assert.equal(db.tables.auth_sessions[0].user_id, id);
  assert.equal(body.user.id, id);
  assert.equal(db.tables.users[0].email, "ama@example.com");
  assert.match(response.headers.get("set-cookie"), /__Host-datax_session=.+HttpOnly; Secure/);
  assert.notEqual(db.tables.users[0].password_hash, good.password);
  assert.match(db.tables.users[0].password_hash, /^pbkdf2\$/);
});

test("duplicate registration does not create another account, wallet or session", async () => {
  const db = fakeDb();
  await register(db, good);
  const { response } = await register(db, { ...good, email: "ama@example.com" });
  assert.equal(response.status, 409);
  assert.equal(db.tables.users.length, 1);
  assert.equal(db.tables.wallet_accounts.length, 1);
  assert.equal(db.tables.auth_sessions.length, 1);
});

test("a failing insert leaves no partial records and reports the real cause", async () => {
  const db = fakeDb({ failOn: /INSERT INTO auth_sessions/ });
  const { response, body } = await register(db, good);
  assert.equal(response.status, 503);
  assert.equal(body.code, "schema_out_of_date");
  assert.match(body.error, /migrations/);
  assert.equal(db.tables.users.length, 0);
  assert.equal(db.tables.wallet_accounts.length, 0);
  assert.equal(db.tables.auth_sessions.length, 0);
});

test("validation errors are specific and write nothing", async () => {
  const db = fakeDb();
  const cases = [
    [{ ...good, name: "A" }, /full name/],
    [{ ...good, email: "nope" }, /valid email/],
    [{ ...good, password: "short" }, /12 and 128/],
    [{ ...good, confirmPassword: "different password!" }, /confirmation/]
  ];
  for (const [payload, pattern] of cases) {
    const { response, body } = await register(db, payload);
    assert.equal(response.status, 400);
    assert.match(body.error, pattern);
  }
  assert.equal(db.tables.users.length, 0);
});

test("a missing database binding returns 503, never an unhandled 500", async () => {
  const { onRequestPost } = await import("../functions/api/auth/register.js");
  const request = new Request("https://datax.test/api/auth/register", { method: "POST", body: "{}" });
  const response = await onRequestPost({ request, env: {} });
  assert.equal(response.status, 503);
});

test("unexpected exceptions return a JSON 500 with a reference id", async () => {
  const db = fakeDb();
  db.prepare = () => { throw new Error("boom"); };
  const { response, body } = await register(db, good);
  assert.equal(response.status, 500);
  assert.equal(body.code, "register_failed");
  assert.ok(body.requestId);
});
