-- 0029: merchant-funded coupons
-- Merchant-created offers are funded by the outlet: the discount reduces the merchant
-- payable instead of becoming a platform expense.

ALTER TABLE coupons ADD COLUMN IF NOT EXISTS funded_by TEXT NOT NULL DEFAULT 'PLATFORM'
  CHECK (funded_by IN ('PLATFORM', 'MERCHANT'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS merchant_funded_discount_paise INTEGER NOT NULL DEFAULT 0
  CHECK (merchant_funded_discount_paise >= 0);
