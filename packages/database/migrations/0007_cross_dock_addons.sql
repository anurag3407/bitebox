-- 0007: one-tap cross-dock add-ons
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS addon_skus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID REFERENCES clusters(id),
  kitchen_id UUID NOT NULL REFERENCES restaurants(id),
  name TEXT NOT NULL,
  price_paise INTEGER NOT NULL CHECK (price_paise > 0),
  cogs_paise INTEGER NOT NULL CHECK (cogs_paise >= 0),
  stock_count INTEGER NOT NULL DEFAULT 0 CHECK (stock_count >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_addon_skus_kitchen ON addon_skus (kitchen_id, is_active, stock_count);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS parent_order_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'PRIMARY';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS addon_gross_margin_paise INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bag_label TEXT;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT fk_orders_parent_order
    FOREIGN KEY (parent_order_id) REFERENCES orders(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT ck_orders_order_type CHECK (
    order_type IN ('PRIMARY', 'ADDON', 'MEAL_PASS', 'SURPLUS', 'CORPORATE')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_orders_parent ON orders (parent_order_id);

-- ---------------------------------------------------------------------------
