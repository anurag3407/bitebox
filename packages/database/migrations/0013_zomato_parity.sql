-- 0013: Zomato-parity pack
-- Wallet & referral growth loop, rider KYC, order experience (scheduling, contactless,
-- cutlery, chat, proof of delivery, issues), dining reservations, safety and preferences.
-- Every statement is idempotent so a partially applied run can be retried.

-- ---------------------------------------------------------------------------
-- Customer preferences, safety and notifications
-- ---------------------------------------------------------------------------
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  order_updates BOOLEAN NOT NULL DEFAULT true,
  offers BOOLEAN NOT NULL DEFAULT true,
  referrals BOOLEAN NOT NULL DEFAULT true,
  newsletter BOOLEAN NOT NULL DEFAULT false,
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  sms_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS safety_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  relationship TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_safety_contacts_user ON safety_contacts(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_safety_contacts_primary
  ON safety_contacts(user_id) WHERE is_primary;

CREATE TABLE IF NOT EXISTS safety_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id),
  order_id UUID REFERENCES orders(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('SOS', 'TRACKING_SHARED', 'DELIVERY_CONCERN')),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_safety_events_open ON safety_events(status, created_at DESC);

-- ---------------------------------------------------------------------------
-- Wallet (closed-loop BiteBox Credits)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallet_accounts (
  user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  balance_paise INTEGER NOT NULL DEFAULT 0 CHECK (balance_paise >= 0),
  lifetime_credited_paise INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_credited_paise >= 0),
  lifetime_spent_paise INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_spent_paise >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'REFERRAL_BONUS', 'REFERRAL_WELCOME', 'REFUND_CREDIT', 'CASHBACK',
    'GOODWILL', 'ORDER_PAYMENT', 'REVERSAL', 'ADMIN_ADJUSTMENT'
  )),
  direction TEXT NOT NULL CHECK (direction IN ('CREDIT', 'DEBIT')),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  balance_after_paise INTEGER NOT NULL CHECK (balance_after_paise >= 0),
  reference_type TEXT,
  reference_id TEXT,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user ON wallet_transactions(user_id, created_at DESC);
-- A given event credits/debits a wallet at most once (idempotent rewards and payments)
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_transactions_ref
  ON wallet_transactions(user_id, kind, reference_id) WHERE reference_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Refer & earn
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral_codes (
  user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  referrer_user_id UUID NOT NULL REFERENCES app_users(id),
  referee_user_id UUID NOT NULL UNIQUE REFERENCES app_users(id),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'QUALIFIED', 'REWARDED', 'CANCELLED', 'EXPIRED')),
  qualifying_order_id UUID REFERENCES orders(id),
  referrer_reward_paise INTEGER NOT NULL DEFAULT 10000 CHECK (referrer_reward_paise >= 0),
  referee_reward_paise INTEGER NOT NULL DEFAULT 5000 CHECK (referee_reward_paise >= 0),
  rewarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_referrals_not_self CHECK (referrer_user_id <> referee_user_id)
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referrals_pending ON referrals(status) WHERE status = 'PENDING';

-- ---------------------------------------------------------------------------
-- Rider KYC / verification
-- ---------------------------------------------------------------------------
ALTER TABLE riders ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE riders ADD COLUMN IF NOT EXISTS rating DOUBLE PRECISION NOT NULL DEFAULT 4.8;
ALTER TABLE riders ADD COLUMN IF NOT EXISTS delivery_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE riders ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$ BEGIN
  ALTER TABLE riders ADD CONSTRAINT ck_riders_verification_status
    CHECK (verification_status IN ('PENDING', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS rider_verifications (
  rider_id UUID PRIMARY KEY REFERENCES riders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED')),
  aadhaar_last4 TEXT,
  pan_verified BOOLEAN NOT NULL DEFAULT false,
  dl_verified BOOLEAN NOT NULL DEFAULT false,
  background_check_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (background_check_status IN ('PENDING', 'CLEAR', 'CONSIDER')),
  training_completed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rider_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN (
    'PROFILE_PHOTO', 'AADHAAR', 'PAN', 'DRIVING_LICENSE',
    'VEHICLE_RC', 'VEHICLE_INSURANCE', 'POLICE_VERIFICATION'
  )),
  file_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  review_note TEXT,
  reviewed_by UUID REFERENCES app_users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_rider_documents_type UNIQUE (rider_id, doc_type)
);
CREATE INDEX IF NOT EXISTS idx_rider_documents_rider ON rider_documents(rider_id);

-- Riders approved before KYC existed are treated as already verified so the fleet keeps running
UPDATE riders SET verification_status = 'VERIFIED' WHERE is_approved;
INSERT INTO rider_verifications (rider_id, status, verified_at, training_completed_at)
SELECT id, 'VERIFIED', NOW(), NOW() FROM riders WHERE is_approved
ON CONFLICT (rider_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Order experience: scheduling, contactless, cutlery, payment method, proof
-- ---------------------------------------------------------------------------
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS order_mode TEXT NOT NULL DEFAULT 'DELIVERY';
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS contactless BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS cutlery_opt_in BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS delivery_preference TEXT;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_mode TEXT NOT NULL DEFAULT 'DELIVERY';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS contactless BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cutlery_opt_in BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_preference TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'RAZORPAY';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_proof_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_latitude DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_longitude DOUBLE PRECISION;

DO $$ BEGIN
  ALTER TABLE quotes ADD CONSTRAINT ck_quotes_order_mode CHECK (order_mode IN ('DELIVERY', 'PICKUP'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT ck_orders_order_mode CHECK (order_mode IN ('DELIVERY', 'PICKUP'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT ck_orders_payment_method CHECK (payment_method IN ('RAZORPAY', 'WALLET', 'COD'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_orders_scheduled ON orders(scheduled_for) WHERE scheduled_for IS NOT NULL;

CREATE TABLE IF NOT EXISTS delivery_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES delivery_assignments(id),
  rider_id UUID NOT NULL REFERENCES riders(id),
  photo_url TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  otp_verified BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_delivery_proofs_order UNIQUE (order_id)
);

-- ---------------------------------------------------------------------------
-- In-order chat (customer <-> rider / restaurant), separate from support tickets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('CUSTOMER_RIDER', 'CUSTOMER_MERCHANT')),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('CUSTOMER', 'RIDER', 'MERCHANT', 'SYSTEM')),
  sender_user_id UUID REFERENCES app_users(id),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_messages_thread ON order_messages(order_id, channel, created_at);

-- ---------------------------------------------------------------------------
-- Order issues & instant remedies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES app_users(id),
  category TEXT NOT NULL CHECK (category IN (
    'MISSING_ITEM', 'WRONG_ITEM', 'COLD_FOOD', 'QUALITY', 'LATE_DELIVERY',
    'SPILLED', 'NOT_DELIVERED', 'OTHER'
  )),
  description TEXT,
  items_json JSONB,
  photos_json JSONB,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED')),
  resolution TEXT CHECK (resolution IN ('FULL_REFUND', 'PARTIAL_REFUND', 'WALLET_CREDIT', 'REDELIVERY', 'COUPON', 'NONE')),
  refund_amount_paise INTEGER NOT NULL DEFAULT 0 CHECK (refund_amount_paise >= 0),
  wallet_credit_paise INTEGER NOT NULL DEFAULT 0 CHECK (wallet_credit_paise >= 0),
  coupon_code TEXT,
  support_ticket_id UUID REFERENCES support_tickets(id),
  admin_note TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_issues_order ON order_issues(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_issues_queue ON order_issues(status, created_at) WHERE status IN ('OPEN', 'UNDER_REVIEW');
-- One open claim per order prevents duplicate compensation while an agent reviews it
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_issues_open
  ON order_issues(order_id) WHERE status IN ('OPEN', 'UNDER_REVIEW');

-- ---------------------------------------------------------------------------
-- Dining reservations (Zomato Dining Out)
-- ---------------------------------------------------------------------------
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS accepts_reservations BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS reservation_slot_minutes INTEGER NOT NULL DEFAULT 30;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS reservation_capacity_per_slot INTEGER NOT NULL DEFAULT 6;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS max_party_size INTEGER NOT NULL DEFAULT 8;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS dining_description TEXT;

CREATE TABLE IF NOT EXISTS dining_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id),
  customer_id UUID NOT NULL REFERENCES app_users(id),
  reservation_date DATE NOT NULL,
  slot_time TEXT NOT NULL CHECK (slot_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  party_size SMALLINT NOT NULL CHECK (party_size BETWEEN 1 AND 20),
  occasion TEXT,
  special_request TEXT,
  status TEXT NOT NULL DEFAULT 'CONFIRMED'
    CHECK (status IN ('CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
  confirmation_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_dining_reservations_customer ON dining_reservations(customer_id, reservation_date DESC);
CREATE INDEX IF NOT EXISTS idx_dining_reservations_restaurant ON dining_reservations(restaurant_id, reservation_date, slot_time);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dining_reservations_slot
  ON dining_reservations(restaurant_id, customer_id, reservation_date, slot_time)
  WHERE status IN ('CONFIRMED', 'SEATED');
