-- 0027: community kitchen donations
-- Donations are paid from BiteBox Credits and parked in DONATION_PAYABLE until the
-- foundation disburses them, so they never inflate platform revenue.

CREATE TABLE IF NOT EXISTS donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  amount_paise INTEGER NOT NULL CHECK (amount_paise BETWEEN 1000 AND 100000),
  fund TEXT NOT NULL DEFAULT 'COMMUNITY_KITCHEN',
  receipt_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PAID' CHECK (status IN ('PAID', 'DISBURSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_donations_user ON donations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_donations_status ON donations(status, created_at);

ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_kind_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_kind_check CHECK (kind IN (
  'REFERRAL_BONUS', 'REFERRAL_WELCOME', 'REFUND_CREDIT', 'CASHBACK',
  'GOODWILL', 'ORDER_PAYMENT', 'REVERSAL', 'ADMIN_ADJUSTMENT', 'RIDER_TIP',
  'MEAL_PASS_PAYMENT', 'GIFT_CARD_PURCHASE', 'GIFT_CARD_REDEEM', 'DONATION'
));
