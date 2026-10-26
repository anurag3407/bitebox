-- Curated discovery collections (e.g. Biryani trail, Late-night legends).
CREATE TABLE IF NOT EXISTS collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS collection_restaurants (
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_restaurants_rank ON collection_restaurants(collection_id, rank);
