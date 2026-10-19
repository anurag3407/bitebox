# Runbook: Merchant Not Responding / Acceptance SLA Timeout

## 1. Symptoms
- Restaurant tablet/console is offline, disconnected from internet, or kitchen staff is unresponsive.
- Paid order countdown exceeds 90 seconds without restaurant clicking Accept or Reject.

## 2. Safe Immediate Action
- Automated background worker `MERCHANT_ACCEPTANCE_TIMEOUT` job claims order.
- Order is atomically transitioned from `AWAITING_MERCHANT` to `CANCELLED`.
- Full refund intent created and dispatched to Razorpay.
- Auto-pause the restaurant's online status (`is_accepting_orders = false`) after 2 consecutive timeouts to prevent accumulating unfulfillable orders.

## 3. Commands / Dashboard References
```sql
-- Check orders nearing deadline
SELECT id, order_number, restaurant_id, merchant_response_deadline_at
FROM orders
WHERE fulfillment_state = 'AWAITING_MERCHANT'
  AND merchant_response_deadline_at < NOW();
```

## 4. Forbidden Actions
- DO NOT force order into `ACCEPTED` state without kitchen confirmation.
- DO NOT prolong the timer beyond 90s without customer consent.

## 5. Escalation Owner
- Merchant Operations Lead & Restaurant Partner Manager.

## 6. Recovery Verification
- Order status marked `CANCELLED`.
- Automatic refund initiated and SMS/Email sent to customer.
- Restaurant notified to check tablet connectivity.

## 7. Customer Communication
- "We are sorry! The restaurant was unable to accept your order within the preparation window. A full refund of ₹{amount} has been initiated."
