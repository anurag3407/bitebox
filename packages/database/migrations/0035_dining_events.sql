-- Zomato Live-style dining events: ticketed chef tables, tastings and shows.
CREATE TABLE IF NOT EXISTS dining_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  category TEXT NOT NULL DEFAULT 'DINING' CHECK (category IN ('DINING', 'MUSIC', 'COMEDY', 'WORKSHOP')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
  capacity INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 200),
  booked_count INTEGER NOT NULL DEFAULT 0 CHECK (booked_count >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at),
  CHECK (booked_count <= capacity)
);

CREATE TABLE IF NOT EXISTS dining_event_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES dining_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 6),
  total_paise INTEGER NOT NULL CHECK (total_paise >= 0),
  status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'CANCELLED')),
  booking_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dining_events_start ON dining_events(starts_at);
CREATE INDEX IF NOT EXISTS idx_dining_event_bookings_user ON dining_event_bookings(user_id);
