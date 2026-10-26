-- 0024: rider incentives, shift slots and incentive payouts
-- In delivery platforms, rider retention depends on surge quests and predictable shifts.
-- Incentive claims become a rider payable immediately and settle with the next payout.

CREATE TABLE IF NOT EXISTS rider_incentives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  target_deliveries INTEGER NOT NULL CHECK (target_deliveries > 0),
  reward_paise INTEGER NOT NULL CHECK (reward_paise > 0),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_rider_incentives_active ON rider_incentives(is_active, ends_at);

CREATE TABLE IF NOT EXISTS rider_incentive_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incentive_id UUID NOT NULL REFERENCES rider_incentives(id),
  rider_id UUID NOT NULL REFERENCES riders(id),
  reward_paise INTEGER NOT NULL CHECK (reward_paise > 0),
  deliveries_at_claim INTEGER NOT NULL CHECK (deliveries_at_claim > 0),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_rider_incentive_claims UNIQUE (incentive_id, rider_id)
);
CREATE INDEX IF NOT EXISTS idx_rider_incentive_claims_rider ON rider_incentive_claims(rider_id, claimed_at DESC);

CREATE TABLE IF NOT EXISTS rider_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_rider_shifts_upcoming ON rider_shifts(is_active, starts_at);

CREATE TABLE IF NOT EXISTS rider_shift_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES rider_shifts(id),
  rider_id UUID NOT NULL REFERENCES riders(id),
  status TEXT NOT NULL DEFAULT 'BOOKED' CHECK (status IN ('BOOKED', 'CANCELLED', 'COMPLETED')),
  booked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  CONSTRAINT uq_rider_shift_bookings UNIQUE (shift_id, rider_id)
);
CREATE INDEX IF NOT EXISTS idx_rider_shift_bookings_rider ON rider_shift_bookings(rider_id, status);

-- Incentive payouts reuse payout_items with no order attached
ALTER TABLE payout_items ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE payout_items ADD COLUMN IF NOT EXISTS incentive_id UUID REFERENCES rider_incentive_claims(id);
DROP INDEX IF EXISTS uq_payout_items_order;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payout_items_order
  ON payout_items(order_id, owner_type) WHERE tip_id IS NULL AND order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payout_items_incentive
  ON payout_items(incentive_id, owner_type) WHERE incentive_id IS NOT NULL;
