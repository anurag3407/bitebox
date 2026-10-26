-- 0030: rider kit issuance
-- Tracks helmets, delivery bags, t-shirts and insurance cards issued to partners.

CREATE TABLE IF NOT EXISTS rider_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('HELMET', 'DELIVERY_BAG', 'T_SHIRT', 'INSURANCE_CARD')),
  size TEXT,
  status TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED', 'RETURNED', 'LOST')),
  notes TEXT,
  issued_by UUID REFERENCES app_users(id),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_rider_equipment UNIQUE (rider_id, item_type)
);
CREATE INDEX IF NOT EXISTS idx_rider_equipment_rider ON rider_equipment(rider_id, status);
