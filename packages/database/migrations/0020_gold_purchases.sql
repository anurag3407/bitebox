-- 0020: paid BiteBox Gold memberships
-- The same Gold plan can be earned (five deliveries) or bought for ₹99/month.

UPDATE membership_plans
   SET price_paise = 9900,
       description = 'Free delivery on orders over ₹199, a Gold badge and priority support.'
 WHERE code = 'GOLD';

CREATE TABLE IF NOT EXISTS membership_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES membership_plans(id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'EXPIRED')),
  razorpay_order_id TEXT NOT NULL UNIQUE,
  razorpay_payment_id TEXT UNIQUE,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_membership_purchases_user ON membership_purchases(user_id, created_at DESC);
