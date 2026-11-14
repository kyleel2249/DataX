import { json, requireUser } from "../../_lib/auth.js";

const MAX_BYTES = 10 * 1024 * 1024 * 1024 * 1024;

function validBytes(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 && n <= MAX_BYTES ? n : null;
}

function validDate(value) {
  if (value === undefined || value === null || value === "") return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
}

export async function onRequestGet({ request, env }) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth.error;
  const result = await env.DATA_DB.prepare(
    "SELECT id,source_type,source_reference,bytes_up,bytes_down,eligible_bytes,session_started_at,session_ended_at,verification_status,created_at FROM bandwidth_events WHERE user_id=? ORDER BY created_at DESC LIMIT 100"
  ).bind(auth.user.id).all();
  return json({ ok: true, events: result.results || [] });
}

export async function onRequestPost({ request, env }) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth.error;
  let body;
  try { body = await request.json(); }
  catch { return json({ error: "Send a valid JSON request." }, 400); }

  const sourceType = String(body.sourceType || "");
  const sourceReference = String(body.sourceReference || "").trim().slice(0, 120);
  const bytesUp = validBytes(body.bytesUp);
  const bytesDown = validBytes(body.bytesDown);
  const idempotencyKey = String(body.idempotencyKey || "").trim();
  const startedAt = validDate(body.sessionStartedAt);
  const endedAt = validDate(body.sessionEndedAt);

  if (!["shared_bandwidth", "data_entitlement", "voucher"].includes(sourceType)) {
    return json({ error: "Select a supported bandwidth or entitlement record type." }, 400);
  }
  if (!sourceReference || sourceReference.length < 3) {
    return json({ error: "Enter the reference supplied by your provider, gateway, or voucher issuer." }, 400);
  }
  if (bytesUp === null || bytesDown === null || bytesUp + bytesDown === 0) {
    return json({ error: "Enter valid uploaded or downloaded byte totals greater than zero." }, 400);
  }
  if (idempotencyKey.length < 12 || idempotencyKey.length > 100) {
    return json({ error: "A valid unique submission reference is required." }, 400);
  }
  if (startedAt === undefined || endedAt === undefined || (startedAt && endedAt && Date.parse(endedAt) <= Date.parse(startedAt))) {
    return json({ error: "Check the session start and end dates." }, 400);
  }

  const id = crypto.randomUUID();
  try {
    await env.DATA_DB.prepare(
      "INSERT INTO bandwidth_events (id,user_id,source_type,source_reference,bytes_up,bytes_down,eligible_bytes,session_started_at,session_ended_at,verification_status,evidence_hash,idempotency_key) VALUES (?,?,?,?,?,?,0,?,?,'pending',NULL,?)"
    ).bind(id, auth.user.id, sourceType, sourceReference, bytesUp, bytesDown, startedAt, endedAt, idempotencyKey).run();
    return json({
      ok: true,
      event: {
        id,
        sourceType,
        sourceReference,
        bytesUp,
        bytesDown,
        eligibleBytes: 0,
        verificationStatus: "pending",
        message: "Record submitted for review. No reward or DTX has been issued."
      }
    }, 201);
  } catch (error) {
    return json({ error: "Submission could not be saved. The reference may already have been used." }, 409);
  }
}
