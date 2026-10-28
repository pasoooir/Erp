-- Scoped RBAC for organization hierarchy and administrative user lifecycle.
CREATE TABLE IF NOT EXISTS user_org_scopes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_unit_id TEXT NOT NULL REFERENCES org_units(id) ON DELETE CASCADE,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, org_unit_id)
);
CREATE INDEX IF NOT EXISTS user_org_scopes_org_unit_idx ON user_org_scopes(org_unit_id);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  UNIQUE (resource, action)
);
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

INSERT OR IGNORE INTO roles (id, name) VALUES ('role-org-manager', 'org_manager');
INSERT OR IGNORE INTO permissions (id, resource, action) VALUES
  ('perm-org-read', 'org_unit', 'read'),
  ('perm-org-create', 'org_unit', 'create'),
  ('perm-org-update', 'org_unit', 'update'),
  ('perm-org-deactivate', 'org_unit', 'deactivate'),
  ('perm-org-activate', 'org_unit', 'activate'),
  ('perm-user-read', 'user', 'read'),
  ('perm-user-create', 'user', 'create'),
  ('perm-user-deactivate', 'user', 'deactivate'),
  ('perm-audit-read', 'audit', 'read');

-- System admins are global; non-admin roles require explicit organization scopes.
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'admin';
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.resource = 'org_unit'
WHERE r.name = 'org_manager';
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.resource = 'org_unit' AND p.action = 'read'
WHERE r.name IN ('operator', 'reader');
