-- Replay protection for signed, read-only ETI service requests.
-- Nonces are short-lived and contain no user or financial data.
CREATE TABLE IF NOT EXISTS integration_request_nonces (
  nonce TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_integration_nonces_created ON integration_request_nonces(created_at);
