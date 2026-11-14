# DataX

**Bandwidth-to-value platform prototype**

DataX is an interactive MVP for measuring eligible connectivity contributions, recording verified bandwidth events, calculating reward allocations, and demonstrating a token-to-commerce flow.

## Important operating boundary

This repository starts as a **sandbox prototype**. It does not connect to MTN, Telecel, AT, an ISP, a payment provider, a blockchain, or a live bandwidth gateway. The dashboard's seeded activity and the "Simulate contribution" action are clearly marked as demo data. They do not measure a device's general internet use, move a mobile data bundle, create a real token, or generate withdrawable money.

Real deployment requires, at minimum:

- Written operator/ISP authorization and documented API scopes for transferable data entitlements or bandwidth resale.
- A network agent or controlled gateway that measures traffic actually delivered, with user consent and abuse controls.
- A funded reward pool and independently reconciled revenue before issuing redeemable rewards.
- A licensed payment/virtual-asset structure and approved providers for custody, exchange, and fiat settlement.
- Security, privacy, consumer-protection, and telecom regulatory review in each launch market.

## Current features

- Responsive dashboard with bandwidth activity, reward estimates, wallet balances, and recent events.
- Demo contribution simulator with explicit sandbox labelling.
- Bandwidth asset ledger with event states and source attribution.
- Reward calculation that separates gross value, contributor allocation, and platform allocation.
- Demo token conversion, order execution against a visible demo liquidity pool, and a local transaction history.
- Demo data bundle and digital product catalogue with checkout from the local cash wallet.
- CSV export of the asset ledger.
- Local persistence using browser localStorage. Reset demo data from Settings.

## Run locally

No build step or API key is required for this static prototype.

1. Open `index.html` in a modern browser, or serve the folder with any static HTTP server.
2. For Cloudflare Pages, connect this repository and use the repository root as the build output directory. No build command is required.
3. The optional `wrangler.toml` documents the Pages project name and compatibility date; configure the actual Cloudflare project and bindings in your account before adding backend services.

## Suggested production architecture

- Cloudflare Pages: web application.
- Cloudflare Workers: authenticated API and provider adapters.
- D1: users, entitlements, metering events, double-entry ledger, orders, and settlement records.
- Queues: asynchronous metering reconciliation and provider callbacks.
- Durable Objects: idempotent session coordination and reservation locks.
- R2: encrypted, access-controlled evidence exports where needed.
- Separate network gateway/agent: actual traffic measurement and routing.
- Blockchain: only finalized, eligible reward issuance and transfers; never raw traffic records or personal data.

The SQL migration in `migrations/0001_initial.sql` is a starting schema, not a deployed database. Do not issue tokens from unverified traffic or unbacked estimates.
