-- 0040: editable platform config and system operational policies

CREATE TABLE IF NOT EXISTS platform_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES app_users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_config (key, value, description) VALUES
  ('pricing:platform_fee_paise', '500'::jsonb, 'Standard platform fee charged on food delivery orders (paise)'),
  ('pricing:free_delivery_threshold_paise', '19900'::jsonb, 'Order subtotal threshold for Gold/membership free delivery (paise)'),
  ('pricing:base_delivery_fee_paise', '3000'::jsonb, 'Base delivery fee charged to customer (paise)'),
  ('pricing:surge_multiplier_bps', '10000'::jsonb, 'Dynamic surge multiplier basis points (10000 = 1.0x)'),
  ('system:maintenance_mode', 'false'::jsonb, 'Flag indicating if customer ordering is temporarily paused for maintenance'),
  ('system:announcement', '{"enabled": false, "message": ""}'::jsonb, 'Platform-wide banner announcement displayed to all customers')
ON CONFLICT (key) DO NOTHING;
