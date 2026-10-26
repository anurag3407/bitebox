-- 0033: restaurant hygiene ratings
-- Partners self-declare the FSSAI-aligned hygiene rating shown on their storefront.

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS hygiene_rating SMALLINT
  CHECK (hygiene_rating BETWEEN 1 AND 5);
