-- 0012: lifetime first-origin merchant reference
-- ---------------------------------------------------------------------------

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS first_origin_merchant_id UUID;

DO $$ BEGIN
  ALTER TABLE app_users ADD CONSTRAINT fk_app_users_first_origin_merchant
    FOREIGN KEY (first_origin_merchant_id) REFERENCES merchants(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
