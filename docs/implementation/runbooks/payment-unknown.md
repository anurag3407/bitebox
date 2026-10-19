# Runbook: Payment Status Unknown / Gateway Ambiguity

## 1. Symptoms
- Customer bank account was debited, but order remains in `PENDING_PAYMENT` state.
- Webhook delivery failed or was delayed by upstream network latency.
- Client browser dropped connection during payment verification call.

## 2. Safe Immediate Action
- Put the order into a safe `RECONCILING` state; DO NOT create a secondary charge or duplicate order.
- Query Razorpay Orders and Payments API directly by `provider_order_id`.
- If Razorpay confirms status `captured`, transition order to `AWAITING_MERCHANT` and notify restaurant.
- If Razorpay indicates no capture occurred after 15 minutes, mark payment attempt `FAILED`.

## 3. Commands / Dashboard References
```bash
# Query Razorpay API directly for order payment status
curl -u "$RAZORPAY_KEY_ID:$RAZORPAY_KEY_SECRET" \
  https://api.razorpay.com/v1/orders/{order_id}/payments
```

## 4. Forbidden Actions
- DO NOT ask customer to repay for the order while status is unknown.
- DO NOT cancel an order whose gateway capture status is unverified.

## 5. Escalation Owner
- Payments Support Specialist & Financial Operations Lead.

## 6. Recovery Verification
- Order `fulfillment_state` updated to `AWAITING_MERCHANT` with valid `payment_id` and captured status in `payments` table.

## 7. Customer Communication
- "We are confirming your payment with your bank. You will receive an update within 2 minutes without needing to reorder."
