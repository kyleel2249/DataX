const test = require("node:test");
const assert = require("node:assert/strict");

async function run(method, headers) {
  const { onRequest } = await import("../functions/_middleware.js");
  let reached = false;
  const response = await onRequest({
    request: new Request("https://datax.example/api/wallet/transfer", { method, headers }),
    next: async () => { reached = true; return new Response("ok"); }
  });
  return { status: response.status, reached };
}

test("same-origin POST is allowed", async () => {
  const r = await run("POST", { Origin: "https://datax.example" });
  assert.equal(r.status, 200);
  assert.ok(r.reached);
});

test("cross-origin POST is blocked", async () => {
  const r = await run("POST", { Origin: "https://evil.example" });
  assert.equal(r.status, 403);
  assert.equal(r.reached, false);
});

test("POST without Origin that the browser marks cross-site is blocked", async () => {
  for (const site of ["cross-site", "same-site"]) {
    const r = await run("POST", { "Sec-Fetch-Site": site });
    assert.equal(r.status, 403, site);
    assert.equal(r.reached, false);
  }
});

test("POST without Origin from same-origin, direct navigation or non-browser clients is allowed", async () => {
  for (const headers of [{ "Sec-Fetch-Site": "same-origin" }, { "Sec-Fetch-Site": "none" }, {}]) {
    const r = await run("POST", headers);
    assert.equal(r.status, 200);
  }
});

test("cross-site GET is not blocked by the CSRF guard", async () => {
  const r = await run("GET", { "Sec-Fetch-Site": "cross-site" });
  assert.equal(r.status, 200);
});

test("native Android origin is allowed with credentialed CORS headers", async () => {
  const { onRequest } = await import("../functions/_middleware.js");
  const response = await onRequest({
    request: new Request("https://datax.example/api/auth/me", { method: "POST", headers: { Origin: "https://appassets.androidplatform.net" } }),
    next: async () => new Response("ok")
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://appassets.androidplatform.net");
  assert.equal(response.headers.get("Access-Control-Allow-Credentials"), "true");
});
