-- 0003: partner onboarding, admin audit, payouts, GST invoices, menu editing,
-- support tickets, masked calling logs and privacy requests. Idempotent.

-- ---------------------------------------------------------------------------
-- Partner onboarding
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id),
  type TEXT NOT NULL CHECK (type IN ('MERCHANT', 'RIDER')),
  status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'APPROVED', 'REJECTED')),
  -- Non-secret application details (business/restaurant or vehicle info)
  details_json JSONB NOT NULL,
  reviewed_by UUID REFERENCES app_users(id),
  review_note TEXT,
  reviewed_at TIMESTAMPTZ,
  -- Entities created on approval
  merchant_id UUID REFERENCES merchants(id),
  restaurant_id UUID REFERENCES restaurants(id),
  rider_id UUID REFERENCES riders(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- One open application per user and type
CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_applications_open
  ON partner_applications(user_id, type) WHERE status = 'SUBMITTED';
CREATE INDEX IF NOT EXISTS idx_partner_applications_status ON partner_applications(status, created_at);

ALTER TABLE merchants ADD COLUMN IF NOT EXISTS gstin TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS pan TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES app_users(id);
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS gstin TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS fssai_license_number TEXT;
ALTER TABLE riders ADD COLUMN IF NOT EXISTS vehicle_number TEXT;
ALTER TABLE riders ADD COLUMN IF NOT EXISTS driving_license_number TEXT;

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES app_users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  details_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit_log(target_type, target_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Payouts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payout_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('MERCHANT', 'RIDER')),
  -- merchants.id or riders.id
  owner_id UUID NOT NULL,
  account_holder_name TEXT NOT NULL,
  ifsc TEXT NOT NULL,
  -- AES-256-GCM ciphertext; only the last 4 digits are ever shown
  account_number_encrypted TEXT NOT NULL,
  account_last4 TEXT NOT NULL,
  -- Provider references (RazorpayX contact / fund account)
  provider_contact_id TEXT,
  provider_fund_account_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_payout_accounts_owner UNIQUE (owner_type, owner_id)
);

CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('MERCHANT', 'RIDER')),
  owner_id UUID NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  order_count INTEGER NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  -- PENDING: awaiting submission; MANUAL: no RazorpayX, pay by bank transfer and record UTR
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'MANUAL', 'PROCESSING', 'PAID', 'FAILED')),
  provider_payout_id TEXT UNIQUE,
  utr TEXT,
  failure_reason TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payouts_owner ON payouts(owner_type, owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);

CREATE TABLE IF NOT EXISTS payout_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL REFERENCES payouts(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  owner_type TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
  -- An order's earnings are paid to each party exactly once
  CONSTRAINT uq_payout_items_order UNIQUE (order_id, owner_type)
);

-- ---------------------------------------------------------------------------
-- GST invoices
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_sequences (
  financial_year TEXT PRIMARY KEY,
  last_seq INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id),
  invoice_number TEXT NOT NULL UNIQUE,
  financial_year TEXT NOT NULL,
  seq INTEGER NOT NULL,
  -- Immutable snapshot of parties, lines and tax split at issue time
  data_json JSONB NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_invoices_fy_seq UNIQUE (financial_year, seq)
);

-- Refunds against an invoiced order need a GST credit note (own sequence per FY)
CREATE TABLE IF NOT EXISTS credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  refund_id UUID NOT NULL UNIQUE REFERENCES refunds(id),
  credit_note_number TEXT NOT NULL UNIQUE,
  financial_year TEXT NOT NULL,
  seq INTEGER NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  data_json JSONB NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Menu editing: archive instead of delete (orders and carts reference items)
-- ---------------------------------------------------------------------------
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE menu_categories ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS description TEXT;

-- ---------------------------------------------------------------------------
-- Support
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES app_users(id),
  order_id UUID REFERENCES orders(id),
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'AWAITING_CUSTOMER', 'RESOLVED')),
  assigned_admin_id UUID REFERENCES app_users(id),
  resolution TEXT,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_customer ON support_tickets(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_queue ON support_tickets(status, last_message_at);
-- One open ticket per order: repeated taps on "Get help" reopen the same conversation
CREATE UNIQUE INDEX IF NOT EXISTS uq_support_tickets_open_order
  ON support_tickets(order_id) WHERE status <> 'RESOLVED' AND order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('CUSTOMER', 'AGENT', 'SYSTEM')),
  sender_id UUID REFERENCES app_users(id),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id, created_at);

-- ---------------------------------------------------------------------------
-- Masked calling audit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  caller_user_id UUID NOT NULL REFERENCES app_users(id),
  caller_role TEXT NOT NULL,
  target TEXT NOT NULL,
  -- BRIDGED: telephony provider connected both parties via a virtual number
  -- DIRECT: number revealed to an authorised participant (no provider configured)
  mode TEXT NOT NULL CHECK (mode IN ('BRIDGED', 'DIRECT')),
  provider_call_id TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_call_logs_order ON call_logs(order_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Privacy (DPDP): account deletion keeps tax records but removes personal data
-- ---------------------------------------------------------------------------
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
