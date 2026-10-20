-- 0002: production hardening
-- Adds database-level invariants (one active rider per order, one active trip per rider,
-- one order per quote, gapless order event sequences), coupon limits, opening hours,
-- ratings, favourites, web push, refund lifecycle tracking and the indexes hot paths need.
-- Every statement is idempotent so a partially applied run can be retried.

-- ---------------------------------------------------------------------------
-- Extensions (optional: trigram search falls back to ILIKE when unavailable)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm unavailable (%), fuzzy search will use ILIKE only', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------
-- Clerk may not share an email (e.g. phone-only sign up); keep uniqueness for non-null values.
ALTER TABLE app_users ALTER COLUMN email DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);

-- One membership row per (user, restaurant)
DELETE FROM merchant_memberships a
 USING merchant_memberships b
 WHERE a.user_id = b.user_id AND a.restaurant_id = b.restaurant_id AND a.ctid < b.ctid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_memberships_user_restaurant
  ON merchant_memberships(user_id, restaurant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_memberships_restaurant ON merchant_memberships(restaurant_id);

-- ---------------------------------------------------------------------------
-- Addresses: soft delete (orders keep their FK) and one default per user
-- ---------------------------------------------------------------------------
ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE customer_addresses ca
   SET is_default = false
 WHERE is_default
   AND EXISTS (
     SELECT 1 FROM customer_addresses newer
      WHERE newer.user_id = ca.user_id AND newer.is_default
        AND (newer.created_at, newer.id) > (ca.created_at, ca.id)
   );
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_addresses_one_default
  ON customer_addresses(user_id) WHERE is_default AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customer_addresses_user ON customer_addresses(user_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Restaurants & catalog
-- ---------------------------------------------------------------------------
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS opening_hours JSONB;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS max_delivery_radius_meters INTEGER NOT NULL DEFAULT 7000;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS packaging_fee_paise INTEGER NOT NULL DEFAULT 2000;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS avg_prep_minutes INTEGER NOT NULL DEFAULT 15;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS commission_bp INTEGER NOT NULL DEFAULT 1500;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$ BEGIN
  ALTER TABLE restaurants ADD CONSTRAINT ck_restaurants_rating CHECK (rating >= 0 AND rating <= 5);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE restaurants ADD CONSTRAINT ck_restaurants_money CHECK (
    avg_price_for_one_paise >= 0 AND packaging_fee_paise >= 0 AND commission_bp BETWEEN 0 AND 10000
    AND max_delivery_radius_meters > 0
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_restaurants_geo ON restaurants(latitude, longitude) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_restaurants_merchant ON restaurants(merchant_id);

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_bestseller BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$ BEGIN
  ALTER TABLE menu_items ADD CONSTRAINT ck_menu_items_price CHECK (price_paise >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE item_variants ADD CONSTRAINT ck_item_variants_price CHECK (price_paise >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE modifier_options ADD CONSTRAINT ck_modifier_options_price CHECK (price_paise >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE modifier_groups ADD CONSTRAINT ck_modifier_groups_bounds CHECK (min_select >= 0 AND max_select >= 1 AND min_select <= max_select);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_menu_categories_restaurant ON menu_categories(restaurant_id, display_order);
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_item_variants_item ON item_variants(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_modifier_groups_item ON modifier_groups(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_modifier_options_group ON modifier_options(group_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_restaurants_name_trgm ON restaurants USING gin (name gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_menu_items_name_trgm ON menu_items USING gin (name gin_trgm_ops)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Coupons: validity windows, global and per-user limits, scoping
-- ---------------------------------------------------------------------------
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS usage_limit_total INTEGER;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS usage_limit_per_user INTEGER;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS first_order_only BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id);

DO $$ BEGIN
  ALTER TABLE coupons ADD CONSTRAINT ck_coupons_values CHECK (
    discount_value >= 0 AND min_order_paise >= 0
    AND (max_discount_paise IS NULL OR max_discount_paise >= 0)
    AND (type <> 'PERCENTAGE' OR discount_value <= 100)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES coupons(id),
  user_id UUID NOT NULL REFERENCES app_users(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  discount_paise INTEGER NOT NULL CHECK (discount_paise >= 0),
  -- RESERVED at checkout, REDEEMED on payment capture, RELEASED when the order dies unpaid or fully refunded
  status TEXT NOT NULL DEFAULT 'RESERVED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_coupon_redemptions_order UNIQUE (order_id)
);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon ON coupon_redemptions(coupon_id) WHERE status <> 'RELEASED';
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user ON coupon_redemptions(coupon_id, user_id) WHERE status <> 'RELEASED';

-- ---------------------------------------------------------------------------
-- Quotes
-- ---------------------------------------------------------------------------
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS distance_meters INTEGER;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS destination_latitude DOUBLE PRECISION;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS destination_longitude DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS idx_quotes_created ON quotes(created_at);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS quote_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address_snapshot JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS prep_time_minutes INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_paise INTEGER NOT NULL DEFAULT 0;

-- Backfill quote_id from the legacy breakdown_json->>'quoteId' (newest order wins on duplicates)
UPDATE orders o
   SET quote_id = (o.breakdown_json->>'quoteId')::uuid
  FROM (
    SELECT DISTINCT ON (breakdown_json->>'quoteId') id
      FROM orders
     WHERE quote_id IS NULL
       AND breakdown_json->>'quoteId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     ORDER BY breakdown_json->>'quoteId', created_at DESC
  ) latest
 WHERE o.id = latest.id;
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_quote ON orders(quote_id) WHERE quote_id IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT ck_orders_money CHECK (payable_paise >= 0 AND refunded_paise >= 0 AND refunded_paise <= payable_paise);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_orders_state_updated ON orders(fulfillment_state, updated_at);
CREATE INDEX IF NOT EXISTS idx_orders_pending_payment ON orders(created_at) WHERE fulfillment_state = 'PENDING_PAYMENT';

-- Renumber legacy order events (all non-initial events used to be written with sequence 3)
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY created_at, sequence, id) AS rn
    FROM order_events
)
UPDATE order_events e SET sequence = n.rn FROM numbered n WHERE e.id = n.id AND e.sequence <> n.rn;
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_events_sequence ON order_events(order_id, sequence);

CREATE TABLE IF NOT EXISTS order_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id),
  customer_id UUID NOT NULL REFERENCES app_users(id),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id),
  rider_id UUID REFERENCES riders(id),
  food_rating SMALLINT NOT NULL CHECK (food_rating BETWEEN 1 AND 5),
  delivery_rating SMALLINT CHECK (delivery_rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_ratings_restaurant ON order_ratings(restaurant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_favorites (
  user_id UUID NOT NULL REFERENCES app_users(id),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, restaurant_id)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_success_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

-- ---------------------------------------------------------------------------
-- Payments & refunds
-- ---------------------------------------------------------------------------
ALTER TABLE payment_attempts ADD COLUMN IF NOT EXISTS failure_reason TEXT;
-- Provider order ids are globally unique at Razorpay; duplicates can only come from
-- fixtures with hard-coded ids. Keep the newest and suffix the rest so webhooks resolve unambiguously.
UPDATE payment_attempts pa
   SET razorpay_order_id = pa.razorpay_order_id || '_dup_' || pa.id
 WHERE EXISTS (SELECT 1 FROM payment_attempts newer
                WHERE newer.razorpay_order_id = pa.razorpay_order_id
                  AND (newer.created_at, newer.id) > (pa.created_at, pa.id));
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_attempts_provider_order ON payment_attempts(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_order ON payment_attempts(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

DO $$ BEGIN
  ALTER TABLE payments ADD CONSTRAINT ck_payments_amount CHECK (amount_paise > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE refunds ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS initiated_by TEXT;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_open ON refunds(status) WHERE status NOT IN ('PROCESSED', 'FAILED');

DO $$ BEGIN
  ALTER TABLE refunds ADD CONSTRAINT ck_refunds_amount CHECK (amount_paise > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Riders & dispatch
-- ---------------------------------------------------------------------------
ALTER TABLE riders ADD COLUMN IF NOT EXISTS heading_degrees DOUBLE PRECISION;
CREATE UNIQUE INDEX IF NOT EXISTS uq_riders_user ON riders(user_id);
CREATE INDEX IF NOT EXISTS idx_riders_available ON riders(last_ping_at) WHERE is_online AND is_approved;

ALTER TABLE delivery_offers ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;
ALTER TABLE delivery_offers ADD COLUMN IF NOT EXISTS response_reason TEXT;
ALTER TABLE delivery_offers ADD COLUMN IF NOT EXISTS distance_to_pickup_meters INTEGER;

-- At most one live offer per order
UPDATE delivery_offers SET status = 'EXPIRED' WHERE status = 'OFFERED' AND expires_at < NOW();
UPDATE delivery_offers d SET status = 'REVOKED'
 WHERE d.status = 'OFFERED'
   AND EXISTS (SELECT 1 FROM delivery_offers newer
                WHERE newer.order_id = d.order_id AND newer.status = 'OFFERED'
                  AND (newer.created_at, newer.id) > (d.created_at, d.id));
CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_offers_live ON delivery_offers(order_id) WHERE status = 'OFFERED';
CREATE INDEX IF NOT EXISTS idx_delivery_offers_rider ON delivery_offers(rider_id, status, created_at DESC);

ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS otp_failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS arrived_pickup_at TIMESTAMPTZ;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS arrived_dropoff_at TIMESTAMPTZ;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS failure_reason TEXT;

-- One active trip per order and per rider (single-order dispatch, ADR 004)
UPDATE delivery_assignments a SET status = 'CANCELLED'
 WHERE a.status IN ('ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROPOFF')
   AND EXISTS (SELECT 1 FROM delivery_assignments newer
                WHERE newer.status IN ('ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROPOFF')
                  AND (newer.order_id = a.order_id OR newer.rider_id = a.rider_id)
                  AND (newer.assigned_at, newer.id) > (a.assigned_at, a.id));
CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_assignments_active_order
  ON delivery_assignments(order_id) WHERE status IN ('ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROPOFF');
CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_assignments_active_rider
  ON delivery_assignments(rider_id) WHERE status IN ('ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROPOFF');
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_order ON delivery_assignments(order_id, assigned_at DESC);

-- ---------------------------------------------------------------------------
-- Durable processing: jobs, outbox, inbox
-- ---------------------------------------------------------------------------
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_error TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_dedupe ON jobs(dedupe_key) WHERE dedupe_key IS NOT NULL;
DROP INDEX IF EXISTS idx_jobs_runnable;
CREATE INDEX IF NOT EXISTS idx_jobs_pending ON jobs(run_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_jobs_leased ON jobs(lease_expires_at) WHERE status = 'PROCESSING';

ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS last_error TEXT;
DROP INDEX IF EXISTS idx_outbox_pending;
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(available_at) WHERE status = 'PENDING';

ALTER TABLE webhook_inbox ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE webhook_inbox ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE webhook_inbox ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE webhook_inbox ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_records(created_at);

-- ---------------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ledger_entries_tx ON ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_order ON ledger_transactions(order_id);
DO $$ BEGIN
  ALTER TABLE ledger_entries ADD CONSTRAINT ck_ledger_entries_side CHECK (
    debit_paise >= 0 AND credit_paise >= 0 AND NOT (debit_paise > 0 AND credit_paise > 0)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
