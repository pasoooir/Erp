-- HR time and leave foundation. This stores raw events and requests only; no shift/overtime/payroll calculations.
CREATE TABLE IF NOT EXISTS employee_time_events (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('clock_in','clock_out')),
  occurred_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS employee_time_events_employee_time_idx
  ON employee_time_events(employee_id,occurred_at DESC,id DESC);

CREATE TABLE IF NOT EXISTS employee_leave_requests (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  leave_type TEXT NOT NULL CHECK (length(leave_type) BETWEEN 2 AND 32),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  decision_note TEXT,
  decided_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  decided_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (end_date >= start_date),
  CHECK ((status IN ('approved','rejected') AND decided_by IS NOT NULL AND decided_at IS NOT NULL) OR status NOT IN ('approved','rejected'))
);
CREATE INDEX IF NOT EXISTS employee_leave_requests_employee_dates_idx
  ON employee_leave_requests(employee_id,start_date,end_date,status);

INSERT OR IGNORE INTO permissions (id,resource,action) VALUES
  ('perm-time-entry-read','time_entry','read'),
  ('perm-time-entry-create','time_entry','create'),
  ('perm-leave-read','leave','read'),
  ('perm-leave-create','leave','create'),
  ('perm-leave-update','leave','update');
INSERT OR IGNORE INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.name='admin' AND p.resource IN ('time_entry','leave');
INSERT OR IGNORE INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.resource IN ('time_entry','leave')
WHERE r.name='org_manager';
