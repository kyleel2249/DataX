-- Authenticated accounts and DTX wallet ledger.
-- Token balances are stored as integer atoms (6 decimal places); fiat uses pesewas.
PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN email_verified_at TEXT;
ALTER TABLE users ADD COLUMN updated_at TEXT;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  asset_symbol TEXT NOT NULL CHECK (asset_symbol IN ('DTX','GHS')),
  balance_atoms INTEGER NOT NULL DEFAULT 0 CHECK (balance_atoms >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen','closed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, asset_symbol)
);

CREATE TABLE IF NOT EXISTS wallet_transfers (
  id TEXT PRIMARY KEY,
  sender_user_id TEXT NOT NULL REFERENCES users(id),
  recipient_user_id TEXT NOT NULL REFERENCES users(id),
  asset_symbol TEXT NOT NULL DEFAULT 'DTX' CHECK (asset_symbol = 'DTX'),
  amount_atoms INTEGER NOT NULL CHECK (amount_atoms > 0),
  fee_atoms INTEGER NOT NULL DEFAULT 0 CHECK (fee_atoms >= 0),
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','settled','failed','reversed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  settled_at TEXT
);

CREATE TABLE IF NOT EXISTS wallet_ledger_entries (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES wallet_transfers(id),
  wallet_account_id TEXT NOT NULL REFERENCES wallet_accounts(id),
  direction TEXT NOT NULL CHECK (direction IN ('debit','credit')),
  amount_atoms INTEGER NOT NULL CHECK (amount_atoms > 0),
  asset_symbol TEXT NOT NULL DEFAULT 'DTX' CHECK (asset_symbol = 'DTX'),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_expiry ON auth_sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_wallets_user_asset ON wallet_accounts(user_id, asset_symbol);
CREATE INDEX IF NOT EXISTS idx_transfers_sender_date ON wallet_transfers(sender_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_transfers_recipient_date ON wallet_transfers(recipient_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_entries_transaction ON wallet_ledger_entries(transaction_id);
