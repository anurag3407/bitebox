-- 0015: local image storage fallback
-- When object storage is not configured, small images are stored in Postgres and
-- served from an unguessable URL. This keeps local demos fully functional.

CREATE TABLE IF NOT EXISTS uploaded_blobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  mime TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  bytes BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_uploaded_blobs_owner ON uploaded_blobs(owner_user_id, created_at DESC);
