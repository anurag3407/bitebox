# Runbook: Rider Incident After Food Pickup

## 1. Symptoms
- Rider encounters accident, vehicle breakdown, or severe incident while order is `OUT_FOR_DELIVERY`.
- Rider contacts emergency support hotline or flags incident via rider app.
- Real-time GPS telemetry marker stops moving for >15 minutes mid-route.

## 2. Safe Immediate Action
- Prioritize rider physical safety and emergency services if required.
- Mark current delivery trip as `CANCELLED_INCIDENT`.
- Re-order meal with priority kitchen tag at the restaurant at platform cost, OR immediately offer customer full refund + instant credit.

## 3. Commands / Dashboard References
```sql
-- Update trip status to CANCELLED and unassign rider
UPDATE delivery_trips SET status = 'CANCELLED' WHERE id = '{trip_id}';
UPDATE riders SET is_busy = false WHERE id = '{rider_id}';
UPDATE orders SET fulfillment_state = 'DELIVERY_FAILED' WHERE id = '{order_id}';
```

## 4. Forbidden Actions
- DO NOT penalize the rider during a verified medical/traffic incident.
- DO NOT mark order as delivered.

## 5. Escalation Owner
- Trust & Safety Lead & Operations Incident Commander.

## 6. Recovery Verification
- Customer compensated; rider safety confirmed; merchant remade or reimbursed.

## 7. Customer Communication
- "Your delivery partner experienced an unexpected transit incident. We are deeply sorry and have processed an immediate full refund + credit."
