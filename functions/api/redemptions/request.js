import { json, requireUser } from "../../_lib/auth.js";

function toAtoms(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,6})?$/.test(text)) return null;
  const [whole,fraction=""] = text.split(".");
  const atoms = Number(whole)*1000000 + Number((fraction+"000000").slice(0,6));
  return Number.isSafeInteger(atoms) && atoms>0 ? atoms : null;
}

export async function onRequestPost({ request, env }) {
  const auth = await requireUser(request,env);
  if (auth.error) return auth.error;
  let body;
  try { body = await request.json(); } catch { return json({error:"Send a valid JSON request."},400); }
  const amountAtoms = toAtoms(body.amount);
  const idempotencyKey = String(body.idempotencyKey || "").trim();
  const payoutMethod = String(body.payoutMethod || "");
  if (!amountAtoms || idempotencyKey.length < 12 || !["mobile_money","bank_transfer"].includes(payoutMethod)) return json({error:"Enter a valid DTX amount, payout method and request reference."},400);
  const terms = await env.DATA_DB.prepare("SELECT reference_value_minor,redemption_fee_bps,redemption_enabled FROM monetary_token_terms WHERE token_symbol='DTX' LIMIT 1").first();
  if (!terms || Number(terms.redemption_enabled)!==1) return json({error:"Cash redemption is not enabled. Requests cannot be accepted until reserve custody, payout services and required approvals are active."},503);
  const reserve = await env.DATA_DB.prepare("SELECT id,available_minor FROM fiat_reserve_accounts WHERE currency='GHS' AND verification_status='verified' AND available_minor>0 ORDER BY available_minor DESC LIMIT 1").first();
  if (!reserve) return json({error:"No verified cash reserve is available for redemption."},409);
  const grossMinor = Math.ceil(amountAtoms / 1000000 * Number(terms.reference_value_minor));
  const feeMinor = Math.ceil(grossMinor * Number(terms.redemption_fee_bps) / 10000);
  const netMinor = grossMinor-feeMinor;
  if (Number(reserve.available_minor)<netMinor) return json({error:"Verified reserve is insufficient for this redemption."},409);
  const wallet = await env.DATA_DB.prepare("SELECT id,balance_atoms FROM wallet_accounts WHERE user_id=? AND asset_symbol='DTX' AND status='active'").bind(auth.user.id).first();
  if (!wallet || Number(wallet.balance_atoms)<amountAtoms) return json({error:"Insufficient DTX balance."},409);
  const requestId = crypto.randomUUID();
  try {
    await env.DATA_DB.batch([
      env.DATA_DB.prepare("UPDATE wallet_accounts SET balance_atoms=balance_atoms-? WHERE id=? AND balance_atoms>=? AND EXISTS (SELECT 1 FROM fiat_reserve_accounts WHERE id=? AND verification_status='verified' AND available_minor>=?)").bind(amountAtoms,wallet.id,amountAtoms,reserve.id,netMinor),
      env.DATA_DB.prepare("INSERT INTO dtx_redemption_requests (id,user_id,token_amount_atoms,gross_value_minor,fee_minor,net_payout_minor,payout_method,reserve_account_id,status,idempotency_key) SELECT ?,?,?,?,?,?,?,?,'requested',? WHERE changes()=1").bind(requestId,auth.user.id,amountAtoms,grossMinor,feeMinor,netMinor,payoutMethod,reserve.id,idempotencyKey),
      env.DATA_DB.prepare("UPDATE fiat_reserve_accounts SET available_minor=available_minor-?,reserved_minor=reserved_minor+? WHERE id=? AND verification_status='verified' AND available_minor>=? AND EXISTS (SELECT 1 FROM dtx_redemption_requests WHERE id=? AND status='reserved')").bind(netMinor,netMinor,reserve.id,netMinor,requestId),
      env.DATA_DB.prepare("UPDATE dtx_redemption_requests SET status='reserved' WHERE id=? AND status='requested' AND changes()=1").bind(requestId),
      env.DATA_DB.prepare("INSERT INTO reserve_movements (id,reserve_account_id,movement_type,direction,amount_minor,currency,verification_status,idempotency_key) SELECT ?,?,'redemption','debit',?,'GHS','confirmed',? WHERE EXISTS (SELECT 1 FROM dtx_redemption_requests WHERE id=? AND status='reserved')").bind(crypto.randomUUID(),reserve.id,netMinor,idempotencyKey+"-reserve",requestId)
    ]);
    const record = await env.DATA_DB.prepare("SELECT id,status,net_payout_minor FROM dtx_redemption_requests WHERE id=?").bind(requestId).first();
    if (!record) return json({error:"Redemption request could not be reserved. No request was accepted."},409);
    return json({ok:true,redemption:{id:record.id,status:record.status,netPayoutGhs:(Number(record.net_payout_minor)/100).toFixed(2),message:"Request reserved for settlement review. This is not a completed cash payout."}},202);
  } catch (error) {
    return json({error:"Redemption request failed. The request reference may already have been used."},409);
  }
}
