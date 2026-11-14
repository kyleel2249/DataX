import { json, verifyPassword, dummyVerify, createSession, cookieHeader, rateLimit, clientIp } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  if (!env.DATA_DB) return json({ error: "DataX account services are not configured yet." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Send a valid JSON request." }, 400); }
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) return json({ error: "Email and password are required." }, 400);
  if (email.length > 254 || password.length > 1024) return json({ error: "Email or password is incorrect." }, 401);
  const ip = clientIp(request);
  const [perAccount, perIp] = await Promise.all([
    rateLimit(env.DATA_DB, `login:${ip}:${email}`, 8, 900),
    rateLimit(env.DATA_DB, `login-ip:${ip}`, 40, 900)
  ]);
  const limited = !perAccount.allowed ? perAccount : (!perIp.allowed ? perIp : null);
  if (limited) return json({ error: "Too many sign-in attempts. Try again later." }, 429, { "retry-after": String(limited.retryAfter) });
  const user = await env.DATA_DB.prepare("SELECT id,email,display_name,password_hash,account_status FROM users WHERE email=? LIMIT 1").bind(email).first();
  const valid = user && user.account_status === "active"
    ? await verifyPassword(password, user.password_hash)
    : await dummyVerify(password);
  if (!valid) return json({ error: "Email or password is incorrect." }, 401);
  const token = await createSession(env.DATA_DB, user.id);
  return json({ ok: true, user: { id: user.id, email: user.email, name: user.display_name } }, 200, { "set-cookie": cookieHeader(token) });
}
