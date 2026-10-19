# Runbook: No Rider Found / Dispatch Starvation

## 1. Symptoms
- Order is in `PREPARING` or `READY_FOR_PICKUP` state, but no idle rider is available within the dispatch radius.
- Dispatch engine retry cycles reach maximum threshold (e.g. 10 minutes past food ready time).
- Customer ETA is slipping significantly.

## 2. Safe Immediate Action
- Automatically expand the candidate search radius from 5 km to 8 km.
- Temporarily boost rider payout incentive for the affected order zone.
- If no rider claims the trip within 15 minutes of food readiness: notify support and initiate proactive cancellation with full refund and apologetic promo coupon (`SORRY50`).

## 3. Commands / Dashboard References
```bash
# Query active online riders in zone
psql "$DATABASE_URL" -c "
  SELECT r.id, u.name, r.is_online, r.is_busy 
  FROM riders r 
  JOIN app_users u ON r.user_id = u.id 
  WHERE r.is_online = true;"
```

## 4. Forbidden Actions
- DO NOT assign an order to a rider who already has an active incomplete delivery trip (violates single active order invariant).
- DO NOT leave customer waiting indefinitely without updates.

## 5. Escalation Owner
- Fleet Dispatch Manager & Support Lead.

## 6. Recovery Verification
- Delivery trip assigned and accepted by incoming rider, or order gracefully cancelled with customer compensated.

## 7. Customer Communication
- "All delivery partners in your area are currently occupied. We are trying our best to assign a rider, or we will issue a full refund shortly."
