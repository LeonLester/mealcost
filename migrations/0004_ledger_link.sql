-- A read-only link to the Ledger training log. The token can only read the weight log, nothing else.
CREATE TABLE IF NOT EXISTS links (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  used_at INTEGER
);
