PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE businesses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE memberships (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'payroll_officer', 'viewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (business_id, user_id),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  invited_email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'payroll_officer', 'viewer')),
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),
  invited_by_user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at TEXT,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by_user_id) REFERENCES users(id)
);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL CHECK (plan IN ('single_monthly', 'single_yearly', 'multi_monthly', 'multi_yearly')),
  status TEXT NOT NULL CHECK (status IN ('trial', 'active', 'past_due', 'cancelled', 'expired')),
  trial_started_at TEXT NOT NULL,
  trial_ends_at TEXT NOT NULL,
  current_period_ends_at TEXT,
  paypal_subscription_id TEXT,
  paypal_payer_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE payroll_periods (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  label TEXT NOT NULL,
  start_date TEXT NOT NULL,
  ppe_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'processed')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE TABLE staff (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  employee_no TEXT,
  position TEXT,
  department TEXT,
  hourly_rate REAL NOT NULL DEFAULT 0,
  bank_name TEXT,
  account_name TEXT,
  account_number TEXT,
  branch TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE time_entries (
  id TEXT PRIMARY KEY,
  payroll_period_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  hours REAL NOT NULL DEFAULT 0,
  notes TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (payroll_period_id, staff_id, work_date),
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);

CREATE TABLE payroll_adjustments (
  id TEXT PRIMARY KEY,
  payroll_period_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('allowance', 'deduction')),
  label TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
);

CREATE TABLE payslips (
  id TEXT PRIMARY KEY,
  payroll_period_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  gross REAL NOT NULL DEFAULT 0,
  deductions REAL NOT NULL DEFAULT 0,
  net REAL NOT NULL DEFAULT 0,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  generated_by_user_id TEXT,
  UNIQUE (payroll_period_id, staff_id),
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  FOREIGN KEY (generated_by_user_id) REFERENCES users(id)
);

CREATE TABLE payroll_snapshots (
  business_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_by_user_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_memberships_user_id ON memberships(user_id);
CREATE INDEX idx_memberships_business_id ON memberships(business_id);
CREATE INDEX idx_invitations_business_id ON invitations(business_id);
CREATE INDEX idx_invitations_invited_email ON invitations(invited_email);
CREATE INDEX idx_payroll_periods_business_id ON payroll_periods(business_id);
CREATE INDEX idx_staff_business_id ON staff(business_id);
CREATE INDEX idx_time_entries_period_staff ON time_entries(payroll_period_id, staff_id);
CREATE INDEX idx_adjustments_period_staff ON payroll_adjustments(payroll_period_id, staff_id);
CREATE INDEX idx_payslips_period_staff ON payslips(payroll_period_id, staff_id);
