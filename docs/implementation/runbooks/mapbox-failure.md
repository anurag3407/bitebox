# Runbook: Mapbox API Outage / Rate Limit Exceeded

## 1. Symptoms
- Mapbox Directions Matrix API returning HTTP 429 (Rate Limit) or 5xx server errors.
- Delivery fee estimations and ETA calculations failing in checkout.
- Rider map navigation polyline failing to render.

## 2. Safe Immediate Action
- Core checkout, pricing, and dispatch MUST automatically engage the built-in Haversine distance fallback with 1.3x circuity multiplier (`@startup/core/serviceability`).
- Check Mapbox account quota and billing status in Mapbox dashboard.
- If Mapbox token is rate limited, rotate to secondary standby access token.

## 3. Commands / Dashboard References
```bash
# Verify Mapbox API availability
curl -s "https://api.mapbox.com/directions/v5/mapbox/driving/77.21,28.63;77.22,28.64?access_token=$MAPBOX_SECRET_TOKEN"
```

## 4. Forbidden Actions
- DO NOT block customer checkout due to external mapping API degradation. The mathematical fallback provides reliable distance and fee computations.

## 5. Escalation Owner
- Lead Frontend Engineer & DevOps Engineer.

## 6. Recovery Verification
- Confirm Mapbox returns valid route geometry within 200ms.
- Fallback flag automatically disengages.

## 7. Customer Communication
- No customer notice required; degraded polyline displays direct route line.
