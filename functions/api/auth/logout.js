import { json, clearCookieHeader, requireUser } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const auth = await requireUser(request,env);
  if (!auth.user) return new Response(null,{status:204,headers:{"set-cookie":clearCookieHeader(),"cache-control":"no-store"}});
  await env.DATA_DB.prepare("UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=?").bind(auth.user.session_id).run();
  return json({ok:true},200,{"set-cookie":clearCookieHeader()});
}
