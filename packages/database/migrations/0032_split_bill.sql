-- 0032: split the bill
-- The host of a delivered order can create equal shares; each friend pays their share
-- from BiteBox Credits and the host receives the credits.

CREATE TABLE IF NOT EXISTS order_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  host_id UUID NOT NULL REFERENCES app_users(id),
  token TEXT NOT NULL UNIQUE,
  parts INTEGER NOT NULL CHECK (parts BETWEEN 2 AND 10),
  total_paise INTEGER NOT NULL CHECK (total_paise > 0),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'SETTLED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_split_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  split_id UUID NOT NULL REFERENCES order_splits(id) ON DELETE CASCADE,
  share_index INTEGER NOT NULL CHECK (share_index > 0),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID')),
  payer_id UUID REFERENCES app_users(id),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_order_split_share UNIQUE (split_id, share_index)
);
CREATE INDEX IF NOT EXISTS idx_split_shares_split ON order_split_shares(split_id, status);

ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_kind_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_kind_check CHECK (kind IN (
  'REFERRAL_BONUS', 'REFERRAL_WELCOME', 'REFUND_CREDIT', 'CASHBACK',
  'GOODWILL', 'ORDER_PAYMENT', 'REVERSAL', 'ADMIN_ADJUSTMENT', 'RIDER_TIP',
  'MEAL_PASS_PAYMENT', 'GIFT_CARD_PURCHASE', 'GIFT_CARD_REDEEM', 'DONATION',
  'SPONSORSHIP_PAYMENT', 'SPLIT_PAYMENT', 'SPLIT_RECEIVED'
));
