-- Group ordering: a host opens a shared cart for one restaurant, members add
-- their own dishes from a link, and the host checks the combined bill out once.

CREATE TABLE IF NOT EXISTS group_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  host_user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'LOCKED', 'COMPLETED', 'ABANDONED')),
  order_id UUID REFERENCES orders(id),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_cart_members (
  group_cart_id UUID NOT NULL REFERENCES group_carts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_cart_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_cart_id UUID NOT NULL REFERENCES group_carts(id) ON DELETE CASCADE,
  participant_user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id),
  variant_id UUID REFERENCES item_variants(id),
  selected_option_ids UUID[] NOT NULL DEFAULT '{}',
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  notes TEXT,
  unit_price_paise INTEGER NOT NULL CHECK (unit_price_paise >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_cart_items_cart ON group_cart_items(group_cart_id);
CREATE INDEX IF NOT EXISTS idx_group_carts_host ON group_carts(host_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_group_cart_order ON group_carts(order_id) WHERE order_id IS NOT NULL;
