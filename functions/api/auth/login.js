import { json, verifyPassword, createSession, cookieHeader } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  if (!env.DATA_DB) return json({ error: "DataX account services are not configured yet." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Send a valid JSON request." }, 400); }
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) return json({ error: "Email and password are required." }, 400);
  const user = await env.DATA_DB.prepare("SELECT id,email,display_name,password_hash,account_status FROM users WHERE email=? LIMIT 1").bind(email).first();
  if (!user || user.account_status !== "active" || !(await verifyPassword(password,user.password_hash))) return json({ error: "Email or password is incorrect." }, 401);
  const token = await createSession(env.DATA_DB,user.id);
  return json({ ok:true,user:{id:user.id,email:user.email,name:user.display_name} },200,{"set-cookie":cookieHeader(token)});
}
