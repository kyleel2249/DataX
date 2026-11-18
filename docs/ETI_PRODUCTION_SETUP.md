# DataX ↔ ETI production integration

## Production endpoints and data boundary

- DataX production Pages origin: `https://datax-eru.pages.dev`
- DataX read-only aggregate endpoint: `GET /api/integrations/eti/summary`
- ETI administrator view: `/datax`
- ETI API route: `GET /api/datax/summary`

The integration transfers aggregate reporting data only. It does not expose member names, email addresses, individual wallet balances, payout destinations, or session tokens. It does not move funds, issue DTX, or add DataX balances to ETI trading capital.

## Required runtime configuration

### DataX Cloudflare Pages — Production secret

Create a Pages Function secret named `ETI_INTEGRATION_SECRET` in the **datax** project under **Settings → Variables and Secrets → Production**.

### ETI GitHub Actions — repository settings

Create/update the following repository Actions settings in `kyleel2249/Elite-Trading-Intelligence`:

| Type | Name | Value |
|---|---|---|
| Variable | `DATAX_API_URL` | `https://datax-eru.pages.dev` |
| Secret | `DATAX_INTEGRATION_SECRET` | The exact same random secret as DataX `ETI_INTEGRATION_SECRET` |

Generate a fresh secret locally (PowerShell):

```powershell
$bytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$secret = -join ($bytes | ForEach-Object { $_.ToString('x2') })
$rng.Dispose()
$secret | Set-Clipboard
```

Paste the clipboard value directly into the two secret fields. Do not commit it, place it in a source file, or send it in chat. The value should be at least 32 characters; the command above generates 96 hexadecimal characters.

A Pages secret change must be active in a fresh **production** Pages deployment before the Functions runtime can use it. If a signed ETI request still returns `invalid_integration_signature` after secret synchronization, trigger a new production deployment from the `main` branch, then rerun ETI deployment verification.

## Database migration state

DataX production uses the existing D1 database `datax-db` (ID `68383689-3265-4e14-8bbe-f418d5ca8fce`) with binding `DATA_DB`. Do not create another database.

Inspect migration state from the repository root:

```powershell
npm run db:migrations:list
```

Apply only pending migrations:

```powershell
npm run db:migrations:apply
```

These scripts explicitly select `wrangler.toml`. This matters on Windows machines where a local `wrangler.jsonc` may take precedence over the repository's `wrangler.toml` and hide the D1 binding. Do not manually replay historical migrations or alter migration history without comparing the live schema first.

## Deploy and verify

1. Confirm the DataX production Pages secret and ETI Actions secret contain the same value.
2. Confirm the ETI Actions variable points to the production DataX origin above.
3. Run the ETI deployment workflow manually from the `main` branch, or push a deployment-triggering change.
4. Confirm the workflow's checks, ETI D1 migrations, and Worker deployment all pass.
5. Sign in to ETI with an administrator account that has MFA and open `/datax`.
6. Confirm the page reports a connected DataX snapshot. A 401/409 from DataX usually indicates a secret mismatch, stale timestamp, or nonce replay; a 503 indicates missing runtime configuration or database binding.

The integration is considered live only after the authenticated ETI-to-DataX request succeeds. A successful code deployment alone does not prove authenticated data exchange.
