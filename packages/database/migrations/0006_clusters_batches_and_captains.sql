-- 0006: clusters, gate drop points, batch dispatch and micro-captain handovers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id UUID NOT NULL REFERENCES cities(id),
  name TEXT NOT NULL,
  polygon_geojson JSONB NOT NULL,
  min_profitable_drops INTEGER NOT NULL DEFAULT 6 CHECK (min_profitable_drops > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drop_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  micro_captain_id UUID REFERENCES app_users(id),
  captain_fee_per_bag_paise INTEGER NOT NULL DEFAULT 300 CHECK (captain_fee_per_bag_paise >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drop_points_cluster ON drop_points (cluster_id);

CREATE TABLE IF NOT EXISTS dispatch_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID NOT NULL REFERENCES clusters(id),
  slot_window TEXT NOT NULL,
  slot_start TIMESTAMPTZ NOT NULL,
  slot_end TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'COLLECTING' CHECK (
    status IN ('COLLECTING', 'THRESHOLD_MET', 'LOCKED', 'IN_TRANSIT', 'HANDED_TO_CAPTAIN', 'COMPLETED')
  ),
  rider_id UUID REFERENCES riders(id),
  rider_trunk_cost_paise INTEGER NOT NULL DEFAULT 4000 CHECK (rider_trunk_cost_paise >= 0),
  total_drops INTEGER NOT NULL DEFAULT 0 CHECK (total_drops >= 0),
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cluster_id, slot_window)
);

CREATE INDEX IF NOT EXISTS idx_dispatch_batches_slot ON dispatch_batches (slot_start, status);

CREATE TABLE IF NOT EXISTS batch_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES dispatch_batches(id) ON DELETE CASCADE,
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  drop_point_id UUID NOT NULL REFERENCES drop_points(id),
  sequence INTEGER NOT NULL DEFAULT 1,
  bag_count INTEGER NOT NULL DEFAULT 1 CHECK (bag_count > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batch_orders_batch ON batch_orders (batch_id, sequence);

CREATE TABLE IF NOT EXISTS captain_handovers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES dispatch_batches(id),
  drop_point_id UUID NOT NULL REFERENCES drop_points(id),
  captain_id UUID REFERENCES app_users(id),
  bag_count INTEGER NOT NULL CHECK (bag_count > 0),
  amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  UNIQUE (batch_id, drop_point_id)
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS batch_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS drop_point_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS slot_window TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS captain_handover_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT fk_orders_batch
    FOREIGN KEY (batch_id) REFERENCES dispatch_batches(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT fk_orders_drop_point
    FOREIGN KEY (drop_point_id) REFERENCES drop_points(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE meal_plans ADD CONSTRAINT fk_meal_plans_cluster
    FOREIGN KEY (cluster_id) REFERENCES clusters(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE user_meal_passes ADD CONSTRAINT fk_user_meal_passes_drop_point
    FOREIGN KEY (default_drop_point_id) REFERENCES drop_points(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
