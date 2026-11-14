-- DataX monetary token and cash-redemption controls (Cloudflare D1 / SQLite)
-- Apply after 0001_initial.sql. Monetary values are integer minor units (pesewas).
PRAGMA foreign_keys = ON;

-- One DTX is targeted at GH₵1.00 (100 pesewas). Live redemption is disabled
-- until reserve custody, payout rails, legal review and reconciliation are approved.
CREATE TABLE IF NOT EXISTS monetary_token_terms (
  id TEXT PRIMARY KEY,
  token_symbol TEXT NOT NULL UNIQUE CHECK (token_symbol = 'DTX'),
  reference_currency TEXT NOT NULL DEFAULT 'GHS' CHECK (reference_currency = 'GHS'),
  reference_value_minor INTEGER NOT NULL DEFAULT 100 CHECK (reference_value_minor > 0),
  decimals INTEGER NOT NULL DEFAULT 6 CHECK (decimals BETWEEN 0 AND 18),
  redemption_fee_bps INTEGER NOT NULL DEFAULT 100 CHECK (redemption_fee_bps BETWEEN 0 AND 10000),
  issuance_requires_funded_reserve INTEGER NOT NULL DEFAULT 1 CHECK (issuance_requires_funded_reserve IN (0,1)),
  redemption_enabled INTEGER NOT NULL DEFAULT 0 CHECK (redemption_enabled IN (0,1)),
  effective_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO monetary_token_terms (id, token_symbol) VALUES ('dtx-default','DTX');

CREATE TABLE IF NOT EXISTS fiat_reserve_accounts (
  id TEXT PRIMARY KEY,
  custodian_name TEXT NOT NULL,
  external_account_reference_hash TEXT,
  currency TEXT NOT NULL DEFAULT 'GHS' CHECK (currency = 'GHS'),
  available_minor INTEGER NOT NULL DEFAULT 0 CHECK (available_minor >= 0),
  reserved_minor INTEGER NOT NULL DEFAULT 0 CHECK (reserved_minor >= 0),
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','pending','verified','suspended')),
  last_reconciled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reserve_movements (
  id TEXT PRIMARY KEY,
  reserve_account_id TEXT NOT NULL REFERENCES fiat_reserve_accounts(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('funding','redemption','buyback','fee','adjustment','reversal')),
  direction TEXT NOT NULL CHECK (direction IN ('credit','debit')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'GHS' CHECK (currency = 'GHS'),
  external_reference_hash TEXT,
  evidence_hash TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','confirmed','rejected','reversed')),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dtx_redemption_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_amount_atoms INTEGER NOT NULL CHECK (token_amount_atoms > 0),
  gross_value_minor INTEGER NOT NULL CHECK (gross_value_minor > 0),
  fee_minor INTEGER NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
  net_payout_minor INTEGER NOT NULL CHECK (net_payout_minor > 0),
  payout_method TEXT NOT NULL CHECK (payout_method IN ('mobile_money','bank_transfer','wallet_credit')),
  payout_destination_hash TEXT,
  reserve_account_id TEXT REFERENCES fiat_reserve_accounts(id),
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','reserved','approved','processing','paid','rejected','cancelled','failed')),
  idempotency_key TEXT NOT NULL UNIQUE,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  settled_at TEXT
);

CREATE TABLE IF NOT EXISTS dtx_buyback_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_amount_atoms INTEGER NOT NULL CHECK (token_amount_atoms > 0),
  gross_value_minor INTEGER NOT NULL CHECK (gross_value_minor > 0),
  fee_minor INTEGER NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
  net_value_minor INTEGER NOT NULL CHECK (net_value_minor > 0),
  reserve_account_id TEXT REFERENCES fiat_reserve_accounts(id),
  status TEXT NOT NULL DEFAULT 'quoted'
    CHECK (status IN ('quoted','accepted','settled','cancelled','failed')),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  settled_at TEXT
);

CREATE TABLE IF NOT EXISTS fiat_payouts (
  id TEXT PRIMARY KEY,
  redemption_request_id TEXT NOT NULL UNIQUE REFERENCES dtx_redemption_requests(id),
  provider TEXT NOT NULL,
  provider_reference TEXT,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'GHS' CHECK (currency = 'GHS'),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','submitted','confirmed','failed','reversed')),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  settled_at TEXT
);

CREATE TABLE IF NOT EXISTS token_supply_snapshots (
  id TEXT PRIMARY KEY,
  token_symbol TEXT NOT NULL DEFAULT 'DTX',
  total_issued_atoms INTEGER NOT NULL CHECK (total_issued_atoms >= 0),
  total_burned_atoms INTEGER NOT NULL CHECK (total_burned_atoms >= 0),
  circulating_atoms INTEGER NOT NULL CHECK (circulating_atoms >= 0),
  verified_reserve_minor INTEGER NOT NULL CHECK (verified_reserve_minor >= 0),
  backing_ratio_bps INTEGER NOT NULL CHECK (backing_ratio_bps >= 0),
  captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reserve_movements_account_date ON reserve_movements(reserve_account_id, created_at);
CREATE INDEX IF NOT EXISTS idx_redemptions_user_status ON dtx_redemption_requests(user_id, status, requested_at);
CREATE INDEX IF NOT EXISTS idx_buybacks_user_status ON dtx_buyback_orders(user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_payouts_status_date ON fiat_payouts(status, created_at);
CREATE INDEX IF NOT EXISTS idx_supply_snapshot_date ON token_supply_snapshots(captured_at);
