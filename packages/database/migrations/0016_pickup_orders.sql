-- 0016: self-pickup orders
-- Pickup orders have no delivery address or rider; the customer collects with a pickup code.

ALTER TABLE orders ALTER COLUMN delivery_address_id DROP NOT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_pickup_ready
  ON orders(restaurant_id, ready_at)
  WHERE order_mode = 'PICKUP' AND fulfillment_state = 'READY_FOR_PICKUP';
