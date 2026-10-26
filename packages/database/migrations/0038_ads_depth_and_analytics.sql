-- 0038: ad campaign depth, event tracking, and performance analytics

ALTER TABLE restaurant_sponsorships
  ADD COLUMN IF NOT EXISTS max_daily_budget_paise INTEGER NOT NULL DEFAULT 9900,
  ADD COLUMN IF NOT EXISTS bid_per_click_paise INTEGER NOT NULL DEFAULT 500;

CREATE TABLE IF NOT EXISTS restaurant_sponsorship_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('IMPRESSION', 'CLICK', 'CONVERSION')),
  source TEXT NOT NULL DEFAULT 'SEARCH' CHECK (source IN ('SEARCH', 'HOME_FEED', 'COLLECTION', 'CUISINE_RAIL')),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  order_amount_paise INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sponsorship_events_rest ON restaurant_sponsorship_events(restaurant_id, event_type, created_at);
