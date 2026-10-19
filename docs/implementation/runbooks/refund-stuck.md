# Runbook: Refund Stuck / Settlement Failure

## 1. Symptoms
- Refund record in `refunds` table remains in `PENDING` state for >2 hours.
- Customer support ticket created regarding missing refund credit.
- Razorpay API returned rate limit error or insufficient merchant balance during refund call.

## 2. Safe Immediate Action
- Check current merchant account balance on Razorpay Dashboard.
- If merchant balance is insufficient for instant refund, top up working capital account.
- Re-trigger the refund processing job in `apps/worker`.

## 3. Commands / Dashboard References
```bash
# Query specific refund status on Razorpay
curl -u "$RAZORPAY_KEY_ID:$RAZORPAY_KEY_SECRET" \
  https://api.razorpay.com/v1/refunds/{refund_id}
```

## 4. Forbidden Actions
- DO NOT manually mark refund as `PROCESSED` in the database without gateway confirmation ID.

## 5. Escalation Owner
- Finance Operations Lead & Customer Experience Manager.

## 6. Recovery Verification
- Confirm `refunds.status` is updated to `PROCESSED` with valid `gateway_refund_id`.
- Verify balancing ledger entry posted in `ledger_entries`.

## 7. Customer Communication
- "Your refund of ₹{amount} has been initiated and will reflect in your original payment method in 3–5 business days (ARN: {arn})."
