import { json, requireUser } from "../../_lib/auth.js";

function toAtoms(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,6})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const atoms = Number(whole) * 1000000 + Number((fraction + "000000").slice(0,6));
  return Number.isSafeInteger(atoms) && atoms > 0 ? atoms : null;
}

export async function onRequestPost({ request, env }) {
  const auth = await requireUser(request,env);
  if (auth.error) return auth.error;
  let body;
  try { body = await request.json(); } catch { return json({error:"Send a valid JSON request."},400); }
  const recipientEmail = String(body.recipientEmail || "").trim().toLowerCase();
  const amountAtoms = toAtoms(body.amount);
  const idempotencyKey = String(body.idempotencyKey || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail) || !amountAtoms || idempotencyKey.length < 12 || idempotencyKey.length > 100) {
    return json({error:"Enter a valid recipient, amount (up to 6 decimals), and unique transfer reference."},400);
  }
  // A retried request with the same reference returns the original result instead of an error.
  const prior = await env.DATA_DB.prepare("SELECT id,sender_user_id,status,amount_atoms,created_at FROM wallet_transfers WHERE idempotency_key=? LIMIT 1").bind(idempotencyKey).first();
  if (prior) {
    if (prior.sender_user_id !== auth.user.id) return json({error:"This request reference was already used."},409);
    return json({ok:true,replayed:true,transfer:{id:prior.id,status:prior.status,amount:(Number(prior.amount_atoms)/1e6).toFixed(6),createdAt:prior.created_at}});
  }
  const recipient = await env.DATA_DB.prepare("SELECT id,email FROM users WHERE email=? AND account_status='active' LIMIT 1").bind(recipientEmail).first();
  if (!recipient) return json({error:"No active DataX account matches that email."},404);
  if (recipient.id === auth.user.id) return json({error:"You cannot transfer DTX to yourself."},400);
  const [senderWallet,recipientWallet] = await Promise.all([
    env.DATA_DB.prepare("SELECT id,balance_atoms FROM wallet_accounts WHERE user_id=? AND asset_symbol='DTX' AND status='active'").bind(auth.user.id).first(),
    env.DATA_DB.prepare("SELECT id FROM wallet_accounts WHERE user_id=? AND asset_symbol='DTX' AND status='active'").bind(recipient.id).first()
  ]);
  if (!senderWallet || !recipientWallet) return json({error:"A wallet account is not available for one of these users."},409);
  if (Number(senderWallet.balance_atoms) < amountAtoms) return json({error:"Insufficient available DTX balance."},409);
  const transferId = crypto.randomUUID();
  try {
    await env.DATA_DB.batch([
      env.DATA_DB.prepare("UPDATE wallet_accounts SET balance_atoms=balance_atoms-? WHERE id=? AND status='active' AND balance_atoms>=? AND EXISTS (SELECT 1 FROM wallet_accounts WHERE id=? AND status='active') AND NOT EXISTS (SELECT 1 FROM wallet_transfers WHERE idempotency_key=?)").bind(amountAtoms,senderWallet.id,amountAtoms,recipientWallet.id,idempotencyKey),
      env.DATA_DB.prepare("INSERT INTO wallet_transfers (id,sender_user_id,recipient_user_id,amount_atoms,idempotency_key,status) SELECT ?,?,?,?,?,'pending' WHERE changes()=1").bind(transferId,auth.user.id,recipient.id,amountAtoms,idempotencyKey),
      env.DATA_DB.prepare("UPDATE wallet_accounts SET balance_atoms=balance_atoms+? WHERE id=? AND status='active' AND EXISTS (SELECT 1 FROM wallet_transfers WHERE id=? AND status='pending')").bind(amountAtoms,recipientWallet.id,transferId),
      env.DATA_DB.prepare("INSERT INTO wallet_ledger_entries (id,transaction_id,wallet_account_id,direction,amount_atoms) SELECT ?,?,?, 'debit',? WHERE EXISTS (SELECT 1 FROM wallet_transfers WHERE id=? AND status='pending')").bind(crypto.randomUUID(),transferId,senderWallet.id,amountAtoms,transferId),
      env.DATA_DB.prepare("INSERT INTO wallet_ledger_entries (id,transaction_id,wallet_account_id,direction,amount_atoms) SELECT ?,?,?, 'credit',? WHERE EXISTS (SELECT 1 FROM wallet_transfers WHERE id=? AND status='pending')").bind(crypto.randomUUID(),transferId,recipientWallet.id,amountAtoms,transferId),
      env.DATA_DB.prepare("UPDATE wallet_transfers SET status='settled',settled_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending' AND (SELECT COUNT(*) FROM wallet_ledger_entries WHERE transaction_id=?)=2").bind(transferId,transferId)
    ]);
    const result = await env.DATA_DB.prepare("SELECT id,status,amount_atoms,created_at FROM wallet_transfers WHERE id=?").bind(transferId).first();
    if (!result) return json({error:"Transfer was not posted. Check your balance and whether this request reference was already used."},409);
    return json({ok:true,transfer:{id:result.id,status:result.status,amount:(Number(result.amount_atoms)/1e6).toFixed(6),createdAt:result.created_at}});
  } catch (error) {
    return json({error:"Transfer could not be posted. The request reference may already have been used."},409);
  }
}
