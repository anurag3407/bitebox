-- 0031: sponsored restaurant placements
-- Outlets can buy a visibility boost for a fixed number of days from their BiteBox
-- Credits. Sponsored restaurants are labelled and lifted in discovery ranking.

CREATE TABLE IF NOT EXISTS restaurant_sponsorships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  purchased_by UUID NOT NULL REFERENCES app_users(id),
  days INTEGER NOT NULL CHECK (days IN (3, 7, 14)),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'CANCELLED')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_sponsorships_active ON restaurant_sponsorships(status, ends_at);

ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_kind_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_kind_check CHECK (kind IN (
  'REFERRAL_BONUS', 'REFERRAL_WELCOME', 'REFUND_CREDIT', 'CASHBACK',
  'GOODWILL', 'ORDER_PAYMENT', 'REVERSAL', 'ADMIN_ADJUSTMENT', 'RIDER_TIP',
  'MEAL_PASS_PAYMENT', 'GIFT_CARD_PURCHASE', 'GIFT_CARD_REDEEM', 'DONATION',
  'SPONSORSHIP_PAYMENT'
));
