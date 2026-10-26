-- 0018: loyalty cashback and BiteBox Gold
-- Customers earn 2% back in credits on every delivered order. Five deliveries unlock
-- a 30-day Gold membership with free delivery above a threshold.

CREATE TABLE IF NOT EXISTS membership_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price_paise INTEGER NOT NULL DEFAULT 0 CHECK (price_paise >= 0),
  duration_days INTEGER NOT NULL CHECK (duration_days > 0),
  benefits_json JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO membership_plans (code, name, description, price_paise, duration_days, benefits_json)
VALUES (
  'GOLD',
  'BiteBox Gold',
  'Free delivery on orders over ₹199, a Gold badge and priority support.',
  0,
  30,
  '{"freeDeliveryAbovePaise": 19900}'::jsonb
)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES membership_plans(id),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'CANCELLED')),
  source TEXT NOT NULL DEFAULT 'EARNED' CHECK (source IN ('EARNED', 'PURCHASED', 'PROMO')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- One live membership at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_memberships_active
  ON user_memberships(user_id) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_user_memberships_user ON user_memberships(user_id, created_at DESC);
