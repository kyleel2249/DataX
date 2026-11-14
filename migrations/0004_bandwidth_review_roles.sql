-- Administrator review roles and immutable bandwidth review history.
PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'
  CHECK (role IN ('member','admin'));
ALTER TABLE bandwidth_events ADD COLUMN reviewed_by TEXT REFERENCES users(id);
ALTER TABLE bandwidth_events ADD COLUMN reviewed_at TEXT;
ALTER TABLE bandwidth_events ADD COLUMN review_reason TEXT;

CREATE TABLE IF NOT EXISTS bandwidth_review_audit (
  id TEXT PRIMARY KEY,
  bandwidth_event_id TEXT NOT NULL REFERENCES bandwidth_events(id),
  member_user_id TEXT NOT NULL REFERENCES users(id),
  reviewer_user_id TEXT NOT NULL REFERENCES users(id),
  previous_status TEXT NOT NULL CHECK (previous_status IN ('pending','verified','rejected','reversed')),
  new_status TEXT NOT NULL CHECK (new_status IN ('verified','rejected')),
  eligible_bytes INTEGER NOT NULL DEFAULT 0 CHECK (eligible_bytes >= 0),
  evidence_reference TEXT,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bandwidth_review_audit_event ON bandwidth_review_audit(bandwidth_event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, account_status);
