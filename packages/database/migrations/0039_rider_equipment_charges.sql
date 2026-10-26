-- 0039: rider equipment renewals and replacement fee deductions

ALTER TABLE rider_equipment
  ADD COLUMN IF NOT EXISTS renewal_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replacement_fee_paise INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS replacement_fee_deducted BOOLEAN NOT NULL DEFAULT false;

UPDATE rider_equipment
   SET renewal_due_at = issued_at + INTERVAL '180 days'
 WHERE renewal_due_at IS NULL;

ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_kind_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_kind_check CHECK (kind IN (
  'REFERRAL_BONUS', 'REFERRAL_WELCOME', 'REFUND_CREDIT', 'CASHBACK',
  'GOODWILL', 'ORDER_PAYMENT', 'REVERSAL', 'ADMIN_ADJUSTMENT', 'RIDER_TIP',
  'MEAL_PASS_PAYMENT', 'GIFT_CARD_PURCHASE', 'GIFT_CARD_REDEEM', 'DONATION',
  'SPONSORSHIP_PAYMENT', 'SPLIT_PAYMENT', 'SPLIT_RECEIVED', 'EVENT_TICKET_PAYMENT',
  'RIDER_EQUIPMENT_FEE'
));
