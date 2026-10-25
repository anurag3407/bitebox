# Runbook: Leaked API Secret / Security Key Incident

## 1. Symptoms
- GitGuardian, GitHub secret scanner, or security researcher reports public exposure of API credentials (e.g. `RAZORPAY_KEY_SECRET`, `CLERK_SECRET_KEY`, `FAST2SMS_API_KEY`).
- Unauthorized API requests detected in provider dashboards.

## 2. Safe Immediate Action
- Identify the compromised key and its exact privileges.
- Generate a new secret key immediately in the provider dashboard (Razorpay / Clerk / Brevo).
- Update `.env` on production VPS and execute a zero-downtime rolling restart (`docker compose up -d`).
- Revoke / delete the compromised secret in provider dashboard immediately after verification.

## 3. Commands / Dashboard References
```bash
# Update secret in production and restart containers
nano /opt/bitebox/.env
docker compose -f /opt/bitebox/infra/compose/docker-compose.yml up -d
```

## 4. Forbidden Actions
- DO NOT revoke the old secret before generating and deploying the new one, as this causes total system outage.
- DO NOT commit secrets to git repositories under any circumstance.

## 5. Escalation Owner
- Chief Information Security Officer (CISO) & Lead DevOps Engineer.

## 6. Recovery Verification
- Verify payment webhooks, auth checks, and notifications succeed with new secrets.
- Confirm old compromised secret returns 401 Unauthorized when tested.

## 7. Customer Communication
- Assess whether customer PII was accessed. If no data breach occurred, no customer notification needed. If PII accessed, comply with relevant statutory notification guidelines.
