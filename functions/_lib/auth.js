const SESSION_COOKIE = "__Host-datax_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
// Cloudflare Workers' WebCrypto rejects PBKDF2 iteration counts above 100,000,
// so this is the maximum the runtime supports.
const PBKDF2_ITERATIONS = 100000;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}

export function cookieHeader(token, maxAge = SESSION_TTL_SECONDS) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}`;
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

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return base64url(new Uint8Array(bits));
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derive(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${base64url(salt)}$${derived}`;
}

export async function verifyPassword(password, encoded) {
  const [scheme, iterationsText, saltText, expected] = String(encoded || "").split("$");
  if (scheme !== "pbkdf2" || !iterationsText || !saltText || !expected) return false;
  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_ITERATIONS) return false;
  try {
    const decode = value => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0));
    const actual = await derive(password, decode(saltText), iterations);
    return safeEqual(actual, expected);
  } catch {
    return false;
  }
}

// Spend the same CPU as a real verification so response time does not reveal
// whether an email address has an account.
export async function dummyVerify(password) {
  await derive(password, new Uint8Array(16), PBKDF2_ITERATIONS);
  return false;
}

export function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

// D1-backed fixed-window throttle. Requires migrations/0005_auth_rate_limits.sql.
// It fails open if the table is unavailable so sign-in is never blocked by a
// missing migration; apply the migration to enforce limits.
export async function rateLimit(db, key, limit, windowSeconds) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  try {
    const row = await db.prepare(
      "INSERT INTO auth_rate_limits (key,window_start,count) VALUES (?,?,1) " +
      "ON CONFLICT(key) DO UPDATE SET " +
      "count=CASE WHEN window_start<=? THEN 1 ELSE count+1 END, " +
      "window_start=CASE WHEN window_start<=? THEN ? ELSE window_start END " +
      "RETURNING count,window_start"
    ).bind(key, nowSeconds, nowSeconds - windowSeconds, nowSeconds - windowSeconds, nowSeconds).first();
    if (!row) return { allowed: true, retryAfter: 0 };
    const allowed = Number(row.count) <= limit;
    return { allowed, retryAfter: allowed ? 0 : Math.max(1, Number(row.window_start) + windowSeconds - nowSeconds) };
  } catch {
    return { allowed: true, retryAfter: 0 };
  }
}

export async function createSession(db, userId) {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = base64url(tokenBytes);
  const tokenHash = await sha256(token);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString().slice(0, 19).replace("T", " ");
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
    "SELECT u.id,u.email,u.display_name,u.account_status,u.role,s.id AS session_id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP AND u.account_status='active' LIMIT 1"
  ).bind(tokenHash).first();
  if (!row) return { error: json({ error: "Your session has expired. Sign in again." }, 401) };
  return { user: row, tokenHash };
}
