# ETI integration

DataX exposes one read-only, aggregate-only service endpoint for ETI:

- `GET /api/integrations/eti/summary`
- Authentication: HMAC-SHA256 over `timestamp\nnonce\nGET\n/api/integrations/eti/summary`
- Headers: `x-datax-timestamp` (Unix seconds), `x-datax-nonce` (unique random value), `x-datax-signature` (lowercase hex HMAC)
- Maximum clock skew: 60 seconds
- Replay prevention: D1-backed nonce table from migration `0006_eti_integration_nonces.sql`

The endpoint returns aggregate account, verified bandwidth, reward allocation, reserve, token-supply, redemption and payout status information. It does not return member PII, wallet-level balances, payout destinations or credentials. It is read-only and explicitly marks the figures as source-reported aggregates, not proof of cash settlement or token backing.

## Configure

1. Apply all DataX D1 migrations to the production database, including migration 0006:
   `npx wrangler d1 migrations apply datax-db --remote`
2. Generate a random secret with at least 32 characters. Configure the same secret independently in both applications:
   - DataX Pages secret: `npx wrangler pages secret put ETI_INTEGRATION_SECRET --project-name datax`
   - ETI Worker secret: `npx wrangler secret put DATAX_INTEGRATION_SECRET`
3. Set ETI's non-secret `DATAX_API_URL` variable to the DataX HTTPS origin (for example, `https://datax.pages.dev`). Do not include a path, credentials, query or fragment.
4. Deploy both applications.
5. Sign in to ETI and open `/datax`. The page reads `/api/datax/summary`, which performs the signed server-to-server request.

Never place the integration secret in browser JavaScript, HTML, a `vars` block, source control, or client storage. Rotate both copies together.

## Financial and operational boundaries

- DTX is not automatically eligible as ETI trading capital.
- No DTX wallet debit, redemption, payout, token issuance or ETI portfolio mutation is exposed by this integration.
- A reserve figure or token reference price is not proof of available cash.
- Any future capital movement must use a separately approved, reconciled, idempotent settlement workflow and record cleared external funds before ETI capital is credited.
- DataX and ETI retain independent D1/KV stores, authentication, deployment and release cycles.
- If DataX is unavailable or misconfigured, ETI trading, market data, risk and portfolio routes continue independently.
