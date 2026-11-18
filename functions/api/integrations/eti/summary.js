import { json } from "../../../_lib/auth.js";

const MAX_CLOCK_SKEW_SECONDS = 60;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,96}$/;

function hex(bytes) {
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("");
}

export function integrationCanonical(timestamp, nonce, method, pathname) {
  return [timestamp, nonce, method.toUpperCase(), pathname].join("\n");
}

export async function signIntegrationRequest(secret, canonical) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(canonical)));
}

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

async function authenticateIntegration(request, env, nowSeconds) {
  const secret = String(env.ETI_INTEGRATION_SECRET || "");
  if (secret.length < 32) return { error: json({ error: "integration_not_configured" }, 503) };
  const timestamp = request.headers.get("x-datax-timestamp") || "";
  const nonce = request.headers.get("x-datax-nonce") || "";
  const signature = (request.headers.get("x-datax-signature") || "").toLowerCase();
  if (!/^\d{10}$/.test(timestamp) || Math.abs(nowSeconds - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS || !NONCE_PATTERN.test(nonce) || !/^[a-f0-9]{64}$/.test(signature)) {
    return { error: json({ error: "invalid_integration_authentication" }, 401) };
  }
  const canonical = integrationCanonical(timestamp, nonce, request.method, new URL(request.url).pathname);
  const expected = await signIntegrationRequest(secret, canonical);
  if (!constantTimeEqual(signature, expected)) return { error: json({ error: "invalid_integration_signature" }, 401) };
  try {
    await env.DATA_DB.prepare("INSERT INTO integration_request_nonces (nonce,created_at) VALUES (?,?)").bind(nonce, nowSeconds).run();
    await env.DATA_DB.prepare("DELETE FROM integration_request_nonces WHERE created_at<?").bind(nowSeconds - 600).run();
  } catch {
    return { error: json({ error: "integration_replay_or_storage_error" }, 409) };
  }
  return { ok: true };
}

async function first(db, sql, ...values) {
  return db.prepare(sql).bind(...values).first();
}

async function all(db, sql, ...values) {
  const result = await db.prepare(sql).bind(...values).all();
  return result.results || [];
}

/** Read-only aggregate export. It deliberately excludes names, email addresses, wallet-level balances and payout destinations. */
export async function onRequestGet({ request, env }) {
  if (!env.DATA_DB) return json({ error: "datax_database_not_configured" }, 503);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const auth = await authenticateIntegration(request, env, nowSeconds);
  if (auth.error) return auth.error;
  try {
    const [accounts, bandwidth, rewards, reserves, supply, redemptions, payouts, issuances] = await Promise.all([
      first(env.DATA_DB, "SELECT COUNT(*) AS total, SUM(CASE WHEN account_status='active' THEN 1 ELSE 0 END) AS active FROM users"),
      first(env.DATA_DB, "SELECT COUNT(*) AS total, SUM(CASE WHEN verification_status='verified' THEN 1 ELSE 0 END) AS verified, SUM(CASE WHEN verification_status='pending' THEN 1 ELSE 0 END) AS pending, COALESCE(SUM(CASE WHEN verification_status='verified' THEN eligible_bytes ELSE 0 END),0) AS verified_eligible_bytes FROM bandwidth_events"),
      first(env.DATA_DB, "SELECT COUNT(*) AS total, COALESCE(SUM(gross_revenue_minor),0) AS gross_revenue_minor, COALESCE(SUM(contributor_amount_minor),0) AS contributor_amount_minor, COALESCE(SUM(platform_amount_minor),0) AS platform_amount_minor, SUM(CASE WHEN status='funded' THEN 1 ELSE 0 END) AS funded, SUM(CASE WHEN status='issued' THEN 1 ELSE 0 END) AS issued, SUM(CASE WHEN status='awaiting_funding' THEN 1 ELSE 0 END) AS awaiting_funding FROM reward_allocations"),
      first(env.DATA_DB, "SELECT COALESCE(SUM(available_minor),0) AS verified_available_minor, COALESCE(SUM(reserved_minor),0) AS verified_reserved_minor, COUNT(*) AS verified_accounts FROM fiat_reserve_accounts WHERE currency='GHS' AND verification_status='verified'"),
      first(env.DATA_DB, "SELECT total_issued_atoms,total_burned_atoms,circulating_atoms,verified_reserve_minor,backing_ratio_bps,captured_at FROM token_supply_snapshots WHERE token_symbol='DTX' ORDER BY captured_at DESC LIMIT 1"),
      all(env.DATA_DB, "SELECT status,COUNT(*) AS count,SUM(net_payout_minor) AS net_payout_minor FROM dtx_redemption_requests GROUP BY status"),
      all(env.DATA_DB, "SELECT status,COUNT(*) AS count,SUM(amount_minor) AS amount_minor FROM fiat_payouts GROUP BY status"),
      all(env.DATA_DB, "SELECT status,COUNT(*) AS count FROM token_issuances GROUP BY status")
    ]);
    return json({
      ok: true,
      source: "DataX",
      integrationVersion: 1,
      asOf: new Date(nowSeconds * 1000).toISOString(),
      classification: "server-side aggregate snapshot; not proof of cash settlement or token backing",
      currency: "GHS",
      accounts: { total: Number(accounts?.total || 0), active: Number(accounts?.active || 0) },
      bandwidth: {
        events: Number(bandwidth?.total || 0), verifiedEvents: Number(bandwidth?.verified || 0),
        pendingEvents: Number(bandwidth?.pending || 0), verifiedEligibleBytes: Number(bandwidth?.verified_eligible_bytes || 0)
      },
      rewards: {
        allocations: Number(rewards?.total || 0), grossRevenueMinor: Number(rewards?.gross_revenue_minor || 0),
        contributorAmountMinor: Number(rewards?.contributor_amount_minor || 0), platformAmountMinor: Number(rewards?.platform_amount_minor || 0),
        funded: Number(rewards?.funded || 0), issued: Number(rewards?.issued || 0), awaitingFunding: Number(rewards?.awaiting_funding || 0)
      },
      reserves: {
        verifiedAccounts: Number(reserves?.verified_accounts || 0), availableMinor: Number(reserves?.verified_available_minor || 0),
        reservedMinor: Number(reserves?.verified_reserved_minor || 0)
      },
      tokenSupply: supply ? {
        totalIssuedAtoms: Number(supply.total_issued_atoms), totalBurnedAtoms: Number(supply.total_burned_atoms),
        circulatingAtoms: Number(supply.circulating_atoms), verifiedReserveMinor: Number(supply.verified_reserve_minor),
        backingRatioBps: Number(supply.backing_ratio_bps), capturedAt: supply.captured_at
      } : null,
      redemptions: redemptions.map(row => ({ status: row.status, count: Number(row.count || 0), netPayoutMinor: Number(row.net_payout_minor || 0) })),
      payouts: payouts.map(row => ({ status: row.status, count: Number(row.count || 0), amountMinor: Number(row.amount_minor || 0) })),
      tokenIssuances: issuances.map(row => ({ status: row.status, count: Number(row.count || 0) })),
      tradingCapitalEligible: false
    });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", scope: "eti_integration_summary", name: error?.name || "Error", message: String(error?.message || error).slice(0, 300) }));
    return json({ error: "integration_summary_unavailable" }, 503);
  }
}

// Production redeploy marker: activate the configured ETI_INTEGRATION_SECRET binding.
