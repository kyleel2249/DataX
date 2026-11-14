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

## DTX monetary and repurchase model\n\nDTX is designed as a money-like token with a target reference value of **1 DTX = GH₵1.00**. Holders should be able to spend DTX in the DataX marketplace and return DTX to the issuer or an authorised liquidity provider for cash repurchase. The target price is a product rule, not proof of cash backing or a guaranteed market price.\n\nThe monetary model follows these rules:\n\n1. **Reserve before issuance:** each redeemable DTX unit must be backed by cleared, reconciled fiat reserve or another explicitly disclosed and independently verified backing asset.\n2. **Cash redemption:** a holder submits DTX for repurchase; the system quotes the GHS amount, discloses fees, checks reserve availability, burns or locks the returned token, and records payout settlement.\n3. **Liquidity discipline:** available reserve, reserved payouts, outstanding DTX liability, fees and payout failures are tracked separately. Redemptions stop automatically when verified reserve is insufficient.\n4. **Auditability:** reserve movements, buyback orders, redemptions and fiat payouts use unique idempotency keys and immutable references.\n5. **No fictional backing:** the local reserve simulator is clearly marked as test data. It cannot enable live redemption or prove that cash exists.\n\nThe prototype now includes a cash-and-reserves screen, a 1 DTX = GH₵1.00 reference quote, reserve-gated DTX repurchases, redemption fee disclosure and a local redemption history. Actual mobile-money/bank payouts, custody, reserve attestations, blockchain issuance/burns and legal authorisations remain unconnected.\n\n## Current features

- Responsive dashboard with bandwidth activity, reward estimates, wallet balances, and recent events.
- Demo contribution simulator with explicit sandbox labelling.
- Bandwidth asset ledger with event states and source attribution.
- Reward calculation that separates gross value, contributor allocation, and platform allocation.
- DTX reward conversion, reserve-gated token repurchases, simulated cash redemption, and local transaction history.\n- Cash and reserve dashboard with published reference value, disclosed fee, reserve funding test records and redemption history.
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

The SQL migration in `migrations/0001_initial.sql` is a starting schema, not a deployed database. Do not issue redeemable tokens from unverified traffic, unfunded reward estimates or reserves that have not been independently confirmed. Do not describe simulated reserve entries or local wallet credits as cash deposits or paid withdrawals.


## Mobile installation and background metering

- **PWA:** serve DataX over HTTPS and use the browser's Install app / Add to Home Screen action. The service worker caches the application shell for offline viewing. Account, transfer and settlement API calls still require a connection.
- **Android app source:** the `android/` project wraps the same DataX interface in a native WebView. The GitHub Actions Android workflow builds a debug APK artifact. After deployment, enter the HTTPS Pages URL in Account & Transfers → Account server connection so the bundled Android app can reach the server API.
- **Android background meter:** the user starts a persistent foreground service from the Bandwidth screen. It samples aggregate device receive/transmit byte counters once per minute and keeps a visible notification with a stop action. No packet payloads are read. Counters remain local to the device.
- **Metering boundary:** aggregate device traffic can include unrelated applications and is not evidence that the user shared or delivered eligible bandwidth. It must not earn DTX until a network gateway/operator validates a contribution, its source and its revenue.
- **iOS:** users can install the PWA to the Home Screen and use its offline shell. iOS does not provide a general-purpose continuous device-wide background traffic meter to ordinary PWAs or apps.

## Server-backed accounts and wallet APIs

The Pages Functions under `functions/api/` provide account registration, sign-in, sign-out, current account details, DTX transfers and reserve-gated redemption requests. Passwords are PBKDF2-hashed; session tokens are stored as hashes and issued in Secure, HttpOnly, SameSite cookies. Email verification, multi-factor authentication, identity checks and login rate limiting still need to be added before public financial use. DTX transfers use integer token atoms and unique idempotency references.

Before account APIs can run, create a Cloudflare D1 database, bind it as `DATA_DB`, and apply migrations in order: `0001_initial.sql`, `0002_dtx_money_and_redemption.sql`, then `0003_accounts_wallets_and_transfers.sql`. Cash redemption remains disabled in the database until reserve and payout operations are authorised and configured. The redemption endpoint can record a request only when the terms flag and verified reserve permit it; it does not itself send Mobile Money or bank funds.
