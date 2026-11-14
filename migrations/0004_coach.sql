-- Coach accounts and client sharing.
-- users.coach = 1 lets a person use the coach screens. It is granted from the admin page, like receipts.
ALTER TABLE users ADD COLUMN coach INTEGER NOT NULL DEFAULT 0;

-- One row per client of a coach. A row is either a profile (the coach imports the data) or linked to the client's own account.
-- status: profile (no account), invited (link sent), active (client approved), revoked (client withdrew access).
CREATE TABLE IF NOT EXISTS coach_clients (
  id TEXT PRIMARY KEY,
  coach_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'profile',
  client_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  scopes TEXT NOT NULL DEFAULT '{"diary":true,"prices":true,"weights":true}',
  targets TEXT,
  invite_hash TEXT,
  invite_exp INTEGER,
  consented_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS coach_clients_coach ON coach_clients(coach_id);
CREATE INDEX IF NOT EXISTS coach_clients_client ON coach_clients(client_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS coach_clients_invite ON coach_clients(invite_hash) WHERE invite_hash IS NOT NULL;

-- The data the coach imported for a profile client. Same gzip snapshot shape as the sync table.
CREATE TABLE IF NOT EXISTS coach_data (
  client_id TEXT PRIMARY KEY REFERENCES coach_clients(id) ON DELETE CASCADE,
  rev INTEGER NOT NULL,
  data BLOB NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Private notes. Only the coach reads them.
CREATE TABLE IF NOT EXISTS coach_notes (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES coach_clients(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS coach_notes_client ON coach_notes(client_id, created_at);

-- Who did what to whose data. The client can see the reads of their own data. Rows are swept after 400 days.
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  actor_id TEXT NOT NULL,
  link_id TEXT NOT NULL,
  subject_id TEXT,
  action TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_link ON audit(link_id, ts);
CREATE INDEX IF NOT EXISTS audit_subject ON audit(subject_id, ts);
