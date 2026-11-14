-- DataX initial schema (Cloudflare D1 / SQLite)
-- This migration defines production-oriented records; it is not applied by the static prototype.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  display_name TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'GH',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS provider_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider_type TEXT NOT NULL CHECK (provider_type IN ('telecom','isp','gateway','router')),
  provider_name TEXT NOT NULL,
  external_account_ref TEXT,
  consent_reference TEXT,
  authorization_scopes TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bandwidth_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider_connection_id TEXT REFERENCES provider_connections(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('shared_bandwidth','data_entitlement','voucher')),
  source_reference TEXT,
  bytes_up INTEGER NOT NULL DEFAULT 0 CHECK (bytes_up >= 0),
  bytes_down INTEGER NOT NULL DEFAULT 0 CHECK (bytes_down >= 0),
  eligible_bytes INTEGER NOT NULL DEFAULT 0 CHECK (eligible_bytes >= 0),
  session_started_at TEXT,
  session_ended_at TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','verified','rejected','reversed')),
  evidence_hash TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS entitlement_assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider_connection_id TEXT REFERENCES provider_connections(id),
  entitlement_type TEXT NOT NULL CHECK (entitlement_type IN ('voucher','transferable_bundle','connectivity_credit')),
  provider_reference TEXT NOT NULL,
  quantity_bytes INTEGER NOT NULL CHECK (quantity_bytes > 0),
  available_bytes INTEGER NOT NULL CHECK (available_bytes >= 0),
  expires_at TEXT,
  redemption_reference TEXT,
  status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (status IN ('unverified','available','reserved','partially_redeemed','redeemed','expired','reversed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reward_allocations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  bandwidth_event_id TEXT NOT NULL REFERENCES bandwidth_events(id),
  gross_revenue_minor INTEGER NOT NULL CHECK (gross_revenue_minor >= 0),
  contributor_amount_minor INTEGER NOT NULL CHECK (contributor_amount_minor >= 0),
  platform_amount_minor INTEGER NOT NULL CHECK (platform_amount_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'GHS',
  funding_reference TEXT,
  status TEXT NOT NULL DEFAULT 'awaiting_funding'
    CHECK (status IN ('awaiting_funding','funded','issued','cancelled','reversed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS token_issuances (
  id TEXT PRIMARY KEY,
  reward_allocation_id TEXT NOT NULL UNIQUE REFERENCES reward_allocations(id),
  chain_id TEXT,
  contract_address TEXT,
  token_amount TEXT NOT NULL,
  transaction_hash TEXT,
  status TEXT NOT NULL DEFAULT 'not_submitted'
    CHECK (status IN ('not_submitted','submitted','confirmed','failed','reversed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ledger_accounts (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES users(id),
  account_type TEXT NOT NULL,
  currency_or_asset TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
  direction TEXT NOT NULL CHECK (direction IN ('debit','credit')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bandwidth_events_user_date ON bandwidth_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_bandwidth_events_status ON bandwidth_events(verification_status);
CREATE INDEX IF NOT EXISTS idx_assets_user_status ON entitlement_assets(user_id, status);
CREATE INDEX IF NOT EXISTS idx_rewards_user_status ON reward_allocations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ledger_transaction ON ledger_entries(transaction_id);
