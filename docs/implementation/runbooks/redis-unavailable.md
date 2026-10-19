# Runbook: Upstash Redis Unavailable

## 1. Symptoms
- Application logs showing HTTP 429 or timeout errors from Upstash REST API.
- Hot rider location updates failing to write or read.
- Read cache misses falling back directly to PostgreSQL.

## 2. Safe Immediate Action
- Core order creation, checkout, payment processing, and state transitions MUST continue operating uninterrupted.
- Fallback rider location retrieval to last persisted PostgreSQL database location.
- Verify Upstash Redis quota and credentials in Upstash console.

## 3. Commands / Dashboard References
```bash
# Test Upstash connection via curl
curl -s -X POST "$UPSTASH_REDIS_REST_URL/ping" -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN"
```

## 4. Forbidden Actions
- DO NOT block or fail checkout/payment routes because Redis cache writes fail. Redis is not financial truth.

## 5. Escalation Owner
- Operations Engineer on call.

## 6. Recovery Verification
- Confirm Redis ping returns `PONG`.
- Verify rider location telemetry writes resume with latency <50ms.

## 7. Customer Communication
- No customer-facing disruption notice is required unless real-time map marker updates are visibly delayed.
