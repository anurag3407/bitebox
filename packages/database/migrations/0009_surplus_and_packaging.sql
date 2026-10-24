-- 0009: surplus rescue bags and D2C packaging/sampling revenue
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS surplus_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id),
  cluster_id UUID REFERENCES clusters(id),
  title TEXT NOT NULL,
  original_value_paise INTEGER NOT NULL CHECK (original_value_paise > 0),
  sale_price_paise INTEGER NOT NULL CHECK (sale_price_paise > 0),
  platform_flat_fee_paise INTEGER NOT NULL CHECK (platform_flat_fee_paise >= 0),
  quantity_available INTEGER NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
  pickup_window_start TIMESTAMPTZ NOT NULL,
  pickup_window_end TIMESTAMPTZ NOT NULL,
  allow_gate_batch_drop BOOLEAN NOT NULL DEFAULT false,
  source_scheduled_delivery_id UUID REFERENCES scheduled_meal_deliveries(id),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SOLD_OUT', 'EXPIRED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_surplus_listings_cluster
  ON surplus_listings (cluster_id, status, pickup_window_start);

CREATE TABLE IF NOT EXISTS d2c_sampling_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name TEXT NOT NULL,
  cluster_id UUID NOT NULL REFERENCES clusters(id),
  target_audience TEXT NOT NULL CHECK (target_audience IN ('CAMPUS', 'TECH_PARK')),
  bounty_per_box_paise INTEGER NOT NULL CHECK (bounty_per_box_paise >= 0),
  remaining_units INTEGER NOT NULL DEFAULT 0 CHECK (remaining_units >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sampling_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES d2c_sampling_campaigns(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  units INTEGER NOT NULL DEFAULT 1 CHECK (units > 0),
  bounty_paise INTEGER NOT NULL CHECK (bounty_paise >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, order_id)
);

CREATE TABLE IF NOT EXISTS packaging_issuances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id),
  cluster_id UUID REFERENCES clusters(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost_paise INTEGER NOT NULL CHECK (unit_cost_paise >= 0),
  total_cost_paise INTEGER NOT NULL CHECK (total_cost_paise >= 0),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS surplus_listing_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS surplus_quantity INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT fk_orders_surplus_listing
    FOREIGN KEY (surplus_listing_id) REFERENCES surplus_listings(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
