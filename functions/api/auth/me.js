import { json, requireUser } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const auth = await requireUser(request,env);
  if (auth.error) return auth.error;
  const wallet = await env.DATA_DB.prepare("SELECT asset_symbol,balance_atoms,status FROM wallet_accounts WHERE user_id=? AND asset_symbol='DTX' LIMIT 1").bind(auth.user.id).first();
  const transfers = await env.DATA_DB.prepare(
    "SELECT t.id,t.amount_atoms,t.status,t.created_at,t.sender_user_id,t.recipient_user_id,CASE WHEN t.sender_user_id=? THEN 'sent' ELSE 'received' END AS direction,CASE WHEN t.sender_user_id=? THEN r.email ELSE s.email END AS counterparty_email FROM wallet_transfers t JOIN users s ON s.id=t.sender_user_id JOIN users r ON r.id=t.recipient_user_id WHERE t.sender_user_id=? OR t.recipient_user_id=? ORDER BY t.created_at DESC LIMIT 25"
  ).bind(auth.user.id,auth.user.id,auth.user.id,auth.user.id).all();
  const balance = Number(wallet?.balance_atoms || 0);
  return json({ok:true,user:{id:auth.user.id,email:auth.user.email,name:auth.user.display_name},wallet:{asset:"DTX",balanceAtoms:balance,balance:(balance/1e6).toFixed(6),status:wallet?.status || "not-created"},transfers:transfers.results || []});
}
