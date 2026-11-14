import { json, hashPassword, prepareSession, cookieHeader, rateLimit, clientIp, logError, isSchemaError, isUniqueViolation } from "../../_lib/auth.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestPost({ request, env }) {
  const requestId = crypto.randomUUID();
  try {
    if (!env.DATA_DB) return json({ error: "DataX account services are not configured yet." }, 503);

    let body;
    try { body = await request.json(); } catch { return json({ error: "Send a valid JSON request." }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Send a valid JSON request." }, 400);

    const name = String(body.name || "").trim().slice(0, 80);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (name.length < 2) return json({ error: "Enter your full name (at least 2 characters)." }, 400);
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) return json({ error: "Enter a valid email address." }, 400);
    if (password.length < 12 || password.length > 128) return json({ error: "Use a password between 12 and 128 characters." }, 400);
    if (body.confirmPassword !== undefined && String(body.confirmPassword) !== password) {
      return json({ error: "The password confirmation does not match." }, 400);
    }

    const limited = await rateLimit(env.DATA_DB, `register-ip:${clientIp(request)}`, 5, 3600);
    if (!limited.allowed) {
      return json({ error: "Too many accounts created from this network. Try again later." }, 429, { "retry-after": String(limited.retryAfter) });
    }

    const existing = await env.DATA_DB.prepare("SELECT id FROM users WHERE email=? LIMIT 1").bind(email).first();
    if (existing) return json({ error: "An account already exists for this email." }, 409);

    const userId = crypto.randomUUID();
    const walletId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    const { token, statement: sessionInsert } = await prepareSession(env.DATA_DB, userId);

    // One atomic batch: the user, the DTX wallet and the session are created
    // together or not at all, so a failure can never leave a partial account.
    await env.DATA_DB.batch([
      env.DATA_DB.prepare("INSERT INTO users (id,email,display_name,password_hash,account_status) VALUES (?,?,?,?, 'active')").bind(userId, email, name, passwordHash),
      env.DATA_DB.prepare("INSERT INTO wallet_accounts (id,user_id,asset_symbol,balance_atoms) VALUES (?,?,'DTX',0)").bind(walletId, userId),
      sessionInsert
    ]);

    return json(
      { ok: true, user: { id: userId, email, name }, wallet: { asset: "DTX", balance: "0.000000" } },
      201,
      { "set-cookie": cookieHeader(token) }
    );
  } catch (error) {
    logError("auth.register", error, { requestId });
    if (isUniqueViolation(error)) return json({ error: "An account already exists for this email." }, 409);
    if (isSchemaError(error)) {
      return json({
        error: "Account services are not fully set up: the database migrations have not all been applied.",
        code: "schema_out_of_date",
        requestId
      }, 503);
    }
    return json({ error: "Account creation failed. Quote this reference if the problem continues: " + requestId, code: "register_failed", requestId }, 500);
  }
}
