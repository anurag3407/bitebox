-- 0010: order-level cutoff used by one-tap add-ons and batch dispatch
-- ---------------------------------------------------------------------------

ALTER TABLE orders ADD COLUMN IF NOT EXISTS slot_cutoff_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_slot_cutoff ON orders (slot_cutoff_at);

-- ---------------------------------------------------------------------------
