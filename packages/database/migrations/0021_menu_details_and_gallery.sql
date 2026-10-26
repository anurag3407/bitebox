-- 0021: richer menu and restaurant detail
-- Allergens, nutrition, spice level, serving size, restaurant amenities and gallery.

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS allergens TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS nutrition_json JSONB;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS spice_level SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS serves INTEGER;

DO $$ BEGIN
  ALTER TABLE menu_items ADD CONSTRAINT ck_menu_items_spice CHECK (spice_level BETWEEN 0 AND 3);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE menu_items ADD CONSTRAINT ck_menu_items_serves CHECK (serves IS NULL OR serves BETWEEN 1 AND 20);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS amenities TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS gallery_json JSONB NOT NULL DEFAULT '[]';
