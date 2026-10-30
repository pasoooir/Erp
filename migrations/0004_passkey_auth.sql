-- Passwordless WebAuthn credentials and short-lived, single-use challenges.
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  credential_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0 CHECK (counter >= 0),
  transports_json TEXT NOT NULL DEFAULT '[]',
  device_type TEXT NOT NULL DEFAULT 'singleDevice'
    CHECK (device_type IN ('singleDevice', 'multiDevice')),
  backed_up INTEGER NOT NULL DEFAULT 0 CHECK (backed_up IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS webauthn_credentials_user_idx
  ON webauthn_credentials(user_id);

CREATE TABLE IF NOT EXISTS auth_challenges (
  challenge TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('bootstrap', 'register', 'login')),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS auth_challenges_expiry_idx
  ON auth_challenges(expires_at);
