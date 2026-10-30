-- HR personnel records and employment contracts. Sensitive payroll/bank/national-ID data is intentionally excluded.
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  employee_no TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  work_email TEXT,
  org_unit_id TEXT NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
  position_unit_id TEXT REFERENCES org_units(id) ON DELETE RESTRICT,
  employment_status TEXT NOT NULL DEFAULT 'active'
    CHECK (employment_status IN ('active', 'leave', 'terminated')),
  hired_on TEXT NOT NULL,
  ended_on TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ended_on IS NULL OR ended_on >= hired_on),
  CHECK (employment_status != 'terminated' OR ended_on IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS employees_org_unit_status_idx ON employees(org_unit_id, employment_status, employee_no);
CREATE UNIQUE INDEX IF NOT EXISTS employees_work_email_unique_idx
  ON employees(work_email COLLATE NOCASE) WHERE work_email IS NOT NULL;

CREATE TABLE IF NOT EXISTS employee_contracts (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  contract_no TEXT NOT NULL UNIQUE COLLATE NOCASE,
  contract_type TEXT NOT NULL CHECK (length(contract_type) BETWEEN 2 AND 40),
  start_date TEXT NOT NULL,
  end_date TEXT,
  signed_on TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'expired', 'terminated')),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS employee_contracts_employee_dates_idx
  ON employee_contracts(employee_id, start_date DESC, contract_no);

INSERT OR IGNORE INTO permissions (id, resource, action) VALUES
  ('perm-employee-read', 'employee', 'read'),
  ('perm-employee-create', 'employee', 'create'),
  ('perm-employee-update', 'employee', 'update'),
  ('perm-contract-read', 'contract', 'read'),
  ('perm-contract-create', 'contract', 'create'),
  ('perm-contract-update', 'contract', 'update');

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'admin' AND p.resource IN ('employee', 'contract');

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.resource IN ('employee', 'contract')
WHERE r.name = 'org_manager';
