# Runbook: Duplicate Payment Capture

## 1. Symptoms
- Customer was charged twice for the same logical order checkout.
- Razorpay dashboard shows two distinct successful payment IDs for one platform order.
- Reconciliation audit script triggers alert on `payments` table.

## 2. Safe Immediate Action
- Lock the order row and identify the primary capture payment ID.
- Flag the secondary payment ID for immediate automated full refund with reason `DUPLICATE_PAYMENT_CAPTURE`.
- Post balancing ledger entries to reverse excess accounts receivable.

## 3. Commands / Dashboard References
```bash
# Issue refund for duplicate payment ID directly via Razorpay
curl -u "$RAZORPAY_KEY_ID:$RAZORPAY_KEY_SECRET" -X POST \
  https://api.razorpay.com/v1/payments/{duplicate_payment_id}/refund \
  -d "amount={amount_paise}" \
  -d "notes[reason]=DUPLICATE_PAYMENT_CAPTURE"
```

## 4. Forbidden Actions
- DO NOT cancel the customer's food order if one valid capture exists.
- DO NOT refund both payments without confirming order fulfillment status.

## 5. Escalation Owner
- Finance Operations & Payments Team Lead.

## 6. Recovery Verification
- Check Razorpay refund receipt ID recorded in `refunds` table.
- Verify customer receives refund SMS/Email notification.

## 7. Customer Communication
- "We noticed an accidental duplicate charge for your order. A full refund of ₹{amount} has been processed back to your source account."
