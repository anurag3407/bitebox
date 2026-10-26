-- 0019: in-app notification centre
-- Every customer-facing outbox event also leaves a durable notification the customer
-- can review in the app, even if push/SMS/email was unavailable.

CREATE TABLE IF NOT EXISTS user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT,
  dedupe_key TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON user_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_unread ON user_notifications(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_notifications_dedupe
  ON user_notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
