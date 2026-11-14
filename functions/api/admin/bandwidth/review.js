import { json, requireUser } from "../../../_lib/auth.js";

function isAdmin(auth) { return auth.user.role === "admin"; }

export async function onRequestGet({ request, env }) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth.error;
  if (!isAdmin(auth)) return json({ error: "Administrator access is required." }, 403);
  const [events, audit] = await Promise.all([
    env.DATA_DB.prepare("SELECT e.id,e.user_id,e.source_type,e.source_reference,e.bytes_up,e.bytes_down,e.eligible_bytes,e.session_started_at,e.session_ended_at,e.verification_status,e.created_at,u.display_name AS member_name,u.email AS member_email FROM bandwidth_events e JOIN users u ON u.id=e.user_id ORDER BY CASE e.verification_status WHEN 'pending' THEN 0 ELSE 1 END,e.created_at DESC LIMIT 200").all(),
    env.DATA_DB.prepare("SELECT a.id,a.bandwidth_event_id,a.new_status,a.eligible_bytes,a.evidence_reference,a.reason,a.created_at,r.display_name AS reviewer_name,m.email AS member_email FROM bandwidth_review_audit a JOIN users r ON r.id=a.reviewer_user_id JOIN users m ON m.id=a.member_user_id ORDER BY a.created_at DESC LIMIT 100").all()
  ]);
  const rows = events.results || [];
  return json({ ok: true, events: rows, audit: audit.results || [], counts: {
    pending: rows.filter(row => row.verification_status === "pending").length,
    verified: rows.filter(row => row.verification_status === "verified").length,
    rejected: rows.filter(row => row.verification_status === "rejected").length
  }});
}

export async function onRequestPost({ request, env }) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth.error;
  if (!isAdmin(auth)) return json({ error: "Administrator access is required." }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Send a valid JSON request." }, 400); }
  const eventId = String(body.eventId || "").trim();
  const decision = String(body.decision || "");
  const reason = String(body.reason || "").trim().slice(0, 500);
  const evidenceReference = String(body.evidenceReference || "").trim().slice(0, 180);
  if (!eventId || !["verified", "rejected"].includes(decision) || reason.length < 10) return json({ error: "Select a decision and provide a review reason of at least 10 characters." }, 400);
  if (decision === "verified" && evidenceReference.length < 8) return json({ error: "A verifiable provider, gateway or evidence reference is required before approval." }, 400);
  const event = await env.DATA_DB.prepare("SELECT id,user_id,bytes_up,bytes_down,verification_status FROM bandwidth_events WHERE id=? LIMIT 1").bind(eventId).first();
  if (!event) return json({ error: "Bandwidth submission was not found." }, 404);
  if (event.user_id === auth.user.id) return json({ error: "Reviewers cannot approve or reject their own submissions." }, 403);
  if (event.verification_status !== "pending") return json({ error: "This submission has already been reviewed." }, 409);
  const totalBytes = Number(event.bytes_up) + Number(event.bytes_down);
  const eligibleBytes = decision === "verified" ? Number(body.eligibleBytes) : 0;
  if (decision === "verified" && (!Number.isSafeInteger(eligibleBytes) || eligibleBytes <= 0 || eligibleBytes > totalBytes)) return json({ error: "Eligible bytes must be a positive whole number no greater than the submitted byte total." }, 400);
  const auditId = crypto.randomUUID();
  try {
    await env.DATA_DB.batch([
      env.DATA_DB.prepare("UPDATE bandwidth_events SET verification_status=?,eligible_bytes=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_reason=? WHERE id=? AND user_id<>? AND verification_status='pending'").bind(decision, eligibleBytes, auth.user.id, reason, eventId, auth.user.id),
      env.DATA_DB.prepare("INSERT INTO bandwidth_review_audit (id,bandwidth_event_id,member_user_id,reviewer_user_id,previous_status,new_status,eligible_bytes,evidence_reference,reason) SELECT ?,?,?,?,?,?,?,?,? WHERE changes()=1").bind(auditId, eventId, event.user_id, auth.user.id, "pending", decision, eligibleBytes, evidenceReference || null, reason)
    ]);
    const saved = await env.DATA_DB.prepare("SELECT id,verification_status,eligible_bytes,reviewed_at FROM bandwidth_events WHERE id=? AND reviewed_by=? AND verification_status=?").bind(eventId, auth.user.id, decision).first();
    if (!saved) return json({ error: "The submission changed during review. Refresh the queue before trying again." }, 409);
    return json({ ok: true, event: saved, message: decision === "verified" ? "Evidence review recorded. This decision does not issue DTX or authorize a payout." : "Submission rejected and review decision recorded." });
  } catch (error) { return json({ error: "The review could not be saved. Refresh the queue and check whether another reviewer processed it." }, 409); }
}
