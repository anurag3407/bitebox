-- 0014: tokenized, expiring public order tracking links
-- Customers can share live delivery status without exposing their account or address.

CREATE TABLE IF NOT EXISTS order_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_share_links_order ON order_share_links(order_id, created_at DESC);
