-- 0011: refund GST adjustment and batch-slot fields on quotes
-- ---------------------------------------------------------------------------

ALTER TABLE refunds ADD COLUMN IF NOT EXISTS tax_adjustment_paise INTEGER NOT NULL DEFAULT 0;

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS drop_point_id UUID;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS slot_window TEXT;

DO $$ BEGIN
  ALTER TABLE quotes ADD CONSTRAINT fk_quotes_drop_point
    FOREIGN KEY (drop_point_id) REFERENCES drop_points(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
