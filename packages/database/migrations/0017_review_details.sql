-- 0017: richer reviews — photos, dish-level ratings and restaurant replies

ALTER TABLE order_ratings ADD COLUMN IF NOT EXISTS photos_json JSONB NOT NULL DEFAULT '[]';
ALTER TABLE order_ratings ADD COLUMN IF NOT EXISTS dish_ratings_json JSONB NOT NULL DEFAULT '[]';
ALTER TABLE order_ratings ADD COLUMN IF NOT EXISTS restaurant_reply TEXT;
ALTER TABLE order_ratings ADD COLUMN IF NOT EXISTS restaurant_replied_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_order_ratings_with_photos
  ON order_ratings(restaurant_id, created_at DESC)
  WHERE jsonb_array_length(photos_json) > 0;
