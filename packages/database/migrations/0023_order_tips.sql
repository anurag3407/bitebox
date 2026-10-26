-- 0023: post-delivery tips
-- A customer can add one tip per delivered order from BiteBox Credits. The tip is
-- immediately a rider payable and is included in the next weekly payout.

CREATE TABLE IF NOT EXISTS order_tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES app_users(id),
  rider_id UUID NOT NULL REFERENCES riders(id),
  amount_paise INTEGER NOT NULL CHECK (amount_paise BETWEEN 1000 AND 50000),
  status TEXT NOT NULL DEFAULT 'PAID' CHECK (status IN ('PAID', 'REFUNDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_tips_rider ON order_tips(rider_id, created_at DESC);

-- Wallet transactions can now record rider tips
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_kind_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_kind_check CHECK (kind IN (
  'REFERRAL_BONUS', 'REFERRAL_WELCOME', 'REFUND_CREDIT', 'CASHBACK',
  'GOODWILL', 'ORDER_PAYMENT', 'REVERSAL', 'ADMIN_ADJUSTMENT', 'RIDER_TIP'
));

-- Payout items can carry an order earning or a tip earning for the same order
ALTER TABLE payout_items ADD COLUMN IF NOT EXISTS tip_id UUID REFERENCES order_tips(id);
ALTER TABLE payout_items DROP CONSTRAINT IF EXISTS uq_payout_items_order;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payout_items_order
  ON payout_items(order_id, owner_type) WHERE tip_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payout_items_tip
  ON payout_items(tip_id, owner_type) WHERE tip_id IS NOT NULL;
