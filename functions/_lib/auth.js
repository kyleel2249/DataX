const SESSION_COOKIE = "__Host-datax_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}

export function cookieHeader(token, maxAge = SESSION_TTL_SECONDS) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function clearCookieHeader() {
  return cookieHeader("", 0);
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64url(new Uint8Array(digest));
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 310000 }, key, 256);
  return `pbkdf2$310000$${base64url(salt)}$${base64url(new Uint8Array(bits))}`;
}

export async function verifyPassword(password, encoded) {
  const [scheme, iterationsText, saltText, expected] = String(encoded || "").split("$");
  if (scheme !== "pbkdf2" || !iterationsText || !saltText || !expected) return false;
  const decode = value => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0));
  const salt = decode(saltText);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: Number(iterationsText) }, key, 256);
  const actual = base64url(new Uint8Array(bits));
  return actual === expected;
}

export async function createSession(db, userId) {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = base64url(tokenBytes);
  const tokenHash = await sha256(token);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await db.prepare("INSERT INTO auth_sessions (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)")
    .bind(id, userId, tokenHash, expiresAt).run();
  return token;
}

function readCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const item = cookie.split(";").map(v => v.trim()).find(v => v.startsWith(name + "="));
  return item ? item.slice(name.length + 1) : null;
}

export async function requireUser(request, env) {
  if (!env.DATA_DB) return { error: json({ error: "The DataX D1 database is not configured." }, 503) };
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return { error: json({ error: "Sign in to continue." }, 401) };
  const tokenHash = await sha256(token);
  const row = await env.DATA_DB.prepare(
    "SELECT u.id,u.email,u.display_name,u.account_status,s.id AS session_id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP AND u.account_status='active' LIMIT 1"
  ).bind(tokenHash).first();
  if (!row) return { error: json({ error: "Your session has expired. Sign in again." }, 401) };
  return { user: row, tokenHash };
}
