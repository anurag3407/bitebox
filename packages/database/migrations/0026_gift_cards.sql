-- 0026: BiteBox gift cards
-- A gift card moves wallet liability into a gift-card liability until the recipient
-- redeems it, so credits are never created without a funding source.

CREATE TABLE IF NOT EXISTS gift_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  purchaser_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  recipient_name TEXT NOT NULL,
  recipient_contact TEXT,
  message TEXT,
  amount_paise INTEGER NOT NULL CHECK (amount_paise BETWEEN 10000 AND 1000000),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REDEEMED', 'EXPIRED', 'CANCELLED')),
  redeemed_by UUID REFERENCES app_users(id),
  redeemed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gift_cards_purchaser ON gift_cards(purchaser_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gift_cards_status ON gift_cards(status, expires_at);

ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_kind_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_kind_check CHECK (kind IN (
  'REFERRAL_BONUS', 'REFERRAL_WELCOME', 'REFUND_CREDIT', 'CASHBACK',
  'GOODWILL', 'ORDER_PAYMENT', 'REVERSAL', 'ADMIN_ADJUSTMENT', 'RIDER_TIP',
  'MEAL_PASS_PAYMENT', 'GIFT_CARD_PURCHASE', 'GIFT_CARD_REDEEM'
));
