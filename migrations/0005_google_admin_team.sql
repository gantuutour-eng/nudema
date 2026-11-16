CREATE TABLE IF NOT EXISTS admin_members (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    google_sub TEXT UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL CHECK (role IN ('owner','admin','operator')),
    permissions TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL CHECK (status IN ('invited','active','suspended','revoked')),
    invite_expires_at TEXT,
    invited_by TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    last_mutation TEXT NOT NULL DEFAULT '',
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    member_id TEXT NOT NULL REFERENCES admin_members(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

CREATE INDEX IF NOT EXISTS idx_admin_sessions_member ON admin_sessions(member_id);

CREATE TABLE IF NOT EXISTS admin_oauth_states (
    state_hash TEXT PRIMARY KEY,
    code_verifier TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS admin_audit (
    id TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL,
    actor_email TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit(created_at DESC);
