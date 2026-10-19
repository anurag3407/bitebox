# Runbook: Webhook Disabled / Delivery Backlog

## 1. Symptoms
- Razorpay dashboard reports elevated webhook failure rates (>5%).
- Webhook inbox shows unprocessed events or delays exceeding 60 seconds.
- Razorpay auto-disables webhook URL due to consecutive HTTP timeouts.

## 2. Safe Immediate Action
- Check `/api/v1/webhooks/razorpay` endpoint error logs in Nginx and web service.
- Verify raw-body HMAC signature verification logic is not rejecting valid payloads.
- Re-enable the webhook in Razorpay Dashboard.
- Replay failed webhook deliveries from the Razorpay merchant dashboard.

## 3. Commands / Dashboard References
```bash
# Check recent webhook processing logs
docker compose -f infra/compose/docker-compose.yml logs --tail=100 web | grep -i webhook
```

## 4. Forbidden Actions
- DO NOT disable webhook signature validation to bypass errors.

## 5. Escalation Owner
- Backend Platform Engineer.

## 6. Recovery Verification
- Send a test webhook from Razorpay dashboard and confirm HTTP 200 within 500ms.
- Verify `webhook_inbox` table status shows `PROCESSED`.

## 7. Customer Communication
- None required unless individual order payment confirmation was visibly delayed.
