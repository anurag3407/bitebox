-- 0005: closed-loop meal plans, pass credits and scheduled deliveries
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS meal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID,
  kitchen_restaurant_id UUID NOT NULL REFERENCES restaurants(id),
  name TEXT NOT NULL,
  sku_type TEXT NOT NULL CHECK (sku_type IN ('STANDARD_LUNCH', 'STANDARD_DINNER')),
  total_meals INTEGER NOT NULL CHECK (total_meals > 0),
  price_paise INTEGER NOT NULL CHECK (price_paise > 0),
  validity_days INTEGER NOT NULL DEFAULT 30 CHECK (validity_days > 0),
  kitchen_contract_payout_paise INTEGER NOT NULL CHECK (kitchen_contract_payout_paise >= 0),
  late_skip_fee_paise INTEGER NOT NULL DEFAULT 2500 CHECK (late_skip_fee_paise >= 0),
  auto_schedule_days INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}',
  slot_window TEXT NOT NULL DEFAULT '12:30-13:30',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meal_plans_cluster ON meal_plans (cluster_id, is_active);

CREATE TABLE IF NOT EXISTS user_meal_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES meal_plans(id),
  meals_remaining INTEGER NOT NULL CHECK (meals_remaining >= 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'EXPIRED', 'EXHAUSTED')),
  auto_schedule_days INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}',
  default_drop_point_id UUID,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_meal_passes_user ON user_meal_passes (user_id, status, expires_at);

CREATE TABLE IF NOT EXISTS scheduled_meal_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_id UUID NOT NULL REFERENCES user_meal_passes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  kitchen_id UUID NOT NULL REFERENCES restaurants(id),
  delivery_date DATE NOT NULL,
  slot_window TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (
    status IN ('SCHEDULED', 'SKIPPED_EARLY', 'CONVERTED_TO_SURPLUS', 'LOCKED_FOR_PREP', 'DELIVERED', 'CANCELLED')
  ),
  source TEXT NOT NULL DEFAULT 'AUTO' CHECK (source IN ('AUTO', 'MANUAL')),
  skip_at TIMESTAMPTZ,
  late_skip_fee_paise INTEGER NOT NULL DEFAULT 0,
  kitchen_payout_guaranteed_paise INTEGER NOT NULL DEFAULT 0,
  surplus_listing_id UUID,
  order_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pass_id, delivery_date, slot_window)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_meal_deliveries_date
  ON scheduled_meal_deliveries (delivery_date, kitchen_id, status);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS meal_pass_delivery_id UUID;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT fk_orders_meal_pass_delivery
    FOREIGN KEY (meal_pass_delivery_id) REFERENCES scheduled_meal_deliveries(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_meal_pass_delivery
  ON orders (meal_pass_delivery_id) WHERE meal_pass_delivery_id IS NOT NULL;

-- ---------------------------------------------------------------------------
