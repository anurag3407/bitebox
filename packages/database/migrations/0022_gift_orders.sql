-- 0022: order for someone else (gifting)
-- The recipient is the delivery contact; the customer keeps control of the order and OTP.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_message TEXT;
