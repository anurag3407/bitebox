# Runbook: Notification Outage (Fast2SMS / Brevo Down)

## 1. Symptoms
- Fast2SMS API returning timeouts or HTTP 500 when sending OTPs or order status updates.
- Brevo transactional email deliveries delayed or failing.
- Customers unable to receive SMS delivery verification OTP.

## 2. Safe Immediate Action
- Customers can view their delivery verification OTP directly within the active order tracking web page (`/orders/[orderId]`).
- Riders can request customer to read the OTP from their screen.
- Verify Fast2SMS and Brevo account balance and status page.

## 3. Commands / Dashboard References
```bash
# Test Fast2SMS API status
curl -s "https://www.fast2sms.com/dev/bulkV2" \
  -H "authorization: $FAST2SMS_API_KEY"
```

## 4. Forbidden Actions
- DO NOT disable OTP verification requirement on delivery completion (protects against false delivery fraud). Instruct rider/customer to check web screen.

## 5. Escalation Owner
- Integrations Engineer & Customer Support Lead.

## 6. Recovery Verification
- Send test SMS via worker and verify receipt within 10 seconds.

## 7. Customer Communication
- "SMS gateways are currently experiencing slight carrier delays. Please check your order tracking screen to view your delivery PIN."
