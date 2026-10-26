-- 0028: rider accident cover and claims
-- Verified partners get platform-funded accident cover. Approved claims become a rider
-- payable immediately and settle with the next payout as their own payout item.

CREATE TABLE IF NOT EXISTS rider_insurance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL UNIQUE REFERENCES riders(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL DEFAULT 'PARTNER_ACCIDENT',
  plan_name TEXT NOT NULL DEFAULT 'Partner Accident Cover',
  coverage_paise INTEGER NOT NULL CHECK (coverage_paise > 0),
  hospital_cash_paise INTEGER NOT NULL DEFAULT 0 CHECK (hospital_cash_paise >= 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'CANCELLED')),
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rider_insurance_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES rider_insurance_policies(id),
  rider_id UUID NOT NULL REFERENCES riders(id),
  incident_type TEXT NOT NULL CHECK (incident_type IN ('ACCIDENT', 'HOSPITALIZATION', 'VEHICLE_DAMAGE', 'OTHER')),
  incident_date DATE NOT NULL,
  description TEXT NOT NULL,
  claimed_paise INTEGER NOT NULL CHECK (claimed_paise BETWEEN 10000 AND 50000000),
  approved_paise INTEGER CHECK (approved_paise IS NULL OR approved_paise > 0),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  review_note TEXT,
  reviewed_by UUID REFERENCES app_users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_rider ON rider_insurance_claims(rider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_status ON rider_insurance_claims(status, created_at);

ALTER TABLE payout_items ADD COLUMN IF NOT EXISTS claim_id UUID REFERENCES rider_insurance_claims(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payout_items_claim
  ON payout_items(claim_id, owner_type) WHERE claim_id IS NOT NULL;
