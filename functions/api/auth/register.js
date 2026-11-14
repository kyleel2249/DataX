import { json, hashPassword, createSession, cookieHeader } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  if (!env.DATA_DB) return json({ error: "DataX account services are not configured yet." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Send a valid JSON request." }, 400); }
  const name = String(body.name || "").trim().slice(0, 80);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter your name and a valid email address." }, 400);
  if (password.length < 12 || password.length > 128) return json({ error: "Use a password between 12 and 128 characters." }, 400);
  const existing = await env.DATA_DB.prepare("SELECT id FROM users WHERE email=? LIMIT 1").bind(email).first();
  if (existing) return json({ error: "An account already exists for this email." }, 409);
  const userId = crypto.randomUUID();
  const walletId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  try {
    await env.DATA_DB.batch([
      env.DATA_DB.prepare("INSERT INTO users (id,email,display_name,password_hash,account_status) VALUES (?,?,?,?, 'active')").bind(userId,email,name,passwordHash),
      env.DATA_DB.prepare("INSERT INTO wallet_accounts (id,user_id,asset_symbol,balance_atoms) VALUES (?,?,'DTX',0)").bind(walletId,userId)
    ]);
    const token = await createSession(env.DATA_DB,userId);
    return json({ ok: true, user: { id:userId,email,name }, wallet: { asset:"DTX",balance:"0.000000" } }, 201, { "set-cookie": cookieHeader(token) });
  } catch (error) {
    return json({ error: "Account creation failed. The email may already be registered." }, 409);
  }
}
