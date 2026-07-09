CREATE TABLE IF NOT EXISTS payroll_snapshots (
  business_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_by_user_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
