PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS system_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  bootstrap_complete INTEGER NOT NULL DEFAULT 0 CHECK (bootstrap_complete IN (0, 1))
);
INSERT OR IGNORE INTO system_state (id, bootstrap_complete) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (name IN ('admin', 'operator', 'reader'))
);
INSERT OR IGNORE INTO roles (id, name) VALUES ('role-admin', 'admin');
INSERT OR IGNORE INTO roles (id, name) VALUES ('role-operator', 'operator');
INSERT OR IGNORE INTO roles (id, name) VALUES ('role-reader', 'reader');

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user_expiry ON sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  attempt_key TEXT NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS login_attempts_key_time ON login_attempts(attempt_key, attempted_at);

CREATE TABLE IF NOT EXISTS org_units (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES org_units(id) ON DELETE RESTRICT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  unit_type TEXT NOT NULL CHECK (unit_type IN ('company', 'site', 'department', 'position', 'production_line', 'warehouse')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS org_units_parent ON org_units(parent_id);
CREATE INDEX IF NOT EXISTS org_units_type_status ON org_units(unit_type, status);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS audit_events_entity ON audit_events(entity_type, entity_id, created_at);
