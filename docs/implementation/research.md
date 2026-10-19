# Domain Research & Competitive Technical Analysis

## 1. Industry Benchmarks: Swiggy & Zomato Architectural Patterns

### 1.1 Order State Lifecycle & 90-Second SLA
Both Swiggy and Zomato operate with an uncompromising restaurant acceptance Service Level Agreement (SLA) commonly set between 60 to 90 seconds.
- **Why**: Prolonged waiting times degrade customer trust. If a kitchen is overloaded or closed, holding customer funds without an immediate resolution causes high support volume.
- **Implementation in ZomatoFresh**: Every paid order sets `merchantResponseDeadlineAt = now + 90s` and schedules a durable `MERCHANT_ACCEPTANCE_TIMEOUT` job in the exact same database transaction. If the restaurant fails to accept within 90 seconds, the worker automatically cancels the order, initiates an automated refund intent, and notifies the customer via SMS/Email.

### 1.2 Razorpay Payment Verification & Raw Webhook Idempotency
- **Client-Side vs Server-Side**: Relying on frontend browser callbacks alone to mark orders as paid is vulnerable to drop-offs, network breaks, and tampering.
- **Security Requirement**: Verification requires HMAC SHA256 computation over `order_id + "|" + payment_id` using the secret key.
- **Webhook Ingestion**: Razorpay webhooks send an `X-Razorpay-Signature` calculated against the raw unparsed request body. In Next.js App Router, using `req.text()` preserves exact whitespace and byte sequences required for signature verification before parsing JSON.

### 1.3 Indian GST & Food Delivery Taxation Structure
- Under Section 9(5) of the CGST Act in India, e-commerce food delivery operators are liable to pay GST on restaurant services provided through their platforms.
- Standard restaurant food services attract 5% GST without Input Tax Credit (ITC).
- Platform delivery and convenience fees attract 18% GST.
- **Implementation in ZomatoFresh**: The `PricingCalculator` models restaurant GST (5%) and delivery GST (18%) separately in integer paise, ensuring compliance with Indian tax invoicing standards.

### 1.4 Geospatial Dispatch & Geodesic Circuity
- While straight-line Haversine distance provides initial rapid bounding checks, urban street networks in Indian metros (such as Delhi NCR) exhibit an average **circuity factor of 1.25 to 1.35x**.
- **Implementation in ZomatoFresh**: The platform uses Mapbox Directions Matrix API for real road-network driving distances and durations, with a robust Haversine distance fallback multiplied by a 1.3x circuity factor when external maps are unavailable or rate-limited.
