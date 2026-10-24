-- 0008: B2B office lunch club and consolidated GST invoicing
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS corporate_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  gstin TEXT NOT NULL,
  billing_address TEXT NOT NULL,
  drop_point_id UUID NOT NULL REFERENCES drop_points(id),
  daily_allowance_per_employee_paise INTEGER NOT NULL CHECK (daily_allowance_per_employee_paise >= 0),
  subsidy_percentage_bp INTEGER NOT NULL DEFAULT 10000 CHECK (subsidy_percentage_bp BETWEEN 0 AND 10000),
  corporate_management_fee_bp INTEGER NOT NULL DEFAULT 500 CHECK (corporate_management_fee_bp BETWEEN 0 AND 10000),
  credit_limit_paise INTEGER NOT NULL DEFAULT 0 CHECK (credit_limit_paise >= 0),
  unbilled_balance_paise INTEGER NOT NULL DEFAULT 0 CHECK (unbilled_balance_paise >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS corporate_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corporate_account_id UUID NOT NULL REFERENCES corporate_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  cost_center_code TEXT NOT NULL,
  email_domain TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (corporate_account_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_corporate_employees_user ON corporate_employees (user_id, is_active);

CREATE TABLE IF NOT EXISTS corporate_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corporate_account_id UUID NOT NULL REFERENCES corporate_accounts(id),
  billing_month TEXT NOT NULL,
  invoice_number TEXT NOT NULL UNIQUE,
  total_paise INTEGER NOT NULL CHECK (total_paise >= 0),
  data_json JSONB NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (corporate_account_id, billing_month)
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS corporate_account_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS corporate_covered_paise INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS corporate_overage_paise INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS corporate_cost_center_code TEXT;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT fk_orders_corporate_account
    FOREIGN KEY (corporate_account_id) REFERENCES corporate_accounts(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
