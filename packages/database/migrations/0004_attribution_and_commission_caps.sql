-- 0004: attribution channels, signed merchant links/sessions and commission caps
-- ---------------------------------------------------------------------------

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS first_origin_restaurant_id UUID;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS first_origin_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE app_users ADD CONSTRAINT fk_app_users_first_origin_restaurant
    FOREIGN KEY (first_origin_restaurant_id) REFERENCES restaurants(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS commission_min_paise INTEGER NOT NULL DEFAULT 1900;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS commission_max_paise INTEGER NOT NULL DEFAULT 4900;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS direct_order_flat_fee_paise INTEGER NOT NULL DEFAULT 1500;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS first_origin_cap_paise INTEGER NOT NULL DEFAULT 4900;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS daily_saas_fee_paise INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE restaurants ADD CONSTRAINT ck_restaurants_commission_band CHECK (
    commission_bp BETWEEN 0 AND 10000
    AND commission_min_paise >= 0
    AND commission_max_paise >= commission_min_paise
    AND direct_order_flat_fee_paise >= 0
    AND first_origin_cap_paise >= 0
    AND daily_saas_fee_paise >= 0
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS acquisition_channel TEXT NOT NULL DEFAULT 'MARKETPLACE';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_bp_applied INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_paise INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS merchant_order_fee_paise INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS merchant_net_payout_paise INTEGER;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT ck_orders_acquisition_channel CHECK (
    acquisition_channel IN (
      'MARKETPLACE', 'MERCHANT_DIRECT_SESSION', 'MERCHANT_FIRST_ORIGIN',
      'MEAL_PASS', 'CORPORATE_CLUB', 'SURPLUS_BAG'
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_orders_acquisition_channel
  ON orders (acquisition_channel, created_at);

CREATE TABLE IF NOT EXISTS merchant_attribution_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  hmac_secret TEXT NOT NULL,
  qr_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_attribution_links_restaurant
  ON merchant_attribution_links (restaurant_id);

CREATE TABLE IF NOT EXISTS customer_merchant_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('QR_SCAN', 'WHATSAPP_LINK', 'STOREFRONT_SLUG')),
  signed_token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (customer_id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_merchant_sessions_expiry
  ON customer_merchant_sessions (customer_id, restaurant_id, expires_at);

ALTER TABLE refunds ADD COLUMN IF NOT EXISTS fault_code TEXT NOT NULL DEFAULT 'PLATFORM_GOODWILL';
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS merchant_recovery_bp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS merchant_deduction_paise INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE refunds ADD CONSTRAINT ck_refunds_fault_code CHECK (
    fault_code IN ('MERCHANT_QUALITY', 'MERCHANT_DELAY', 'RIDER_DELAY', 'PLATFORM_GOODWILL')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE refunds ADD CONSTRAINT ck_refunds_recovery CHECK (
    merchant_recovery_bp BETWEEN 0 AND 10000
    AND merchant_deduction_paise >= 0
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS fault_code TEXT NOT NULL DEFAULT 'PLATFORM_GOODWILL';
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS merchant_deduction_paise INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
