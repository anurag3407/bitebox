# Role-Based Access Control (RBAC) & Security Policy

## Roles

| Role | Granted by | Can |
|---|---|---|
| CUSTOMER | Automatically on first sign-in | Browse, quote, check out, pay, track/cancel/rate **own** orders, manage own addresses, favourites, push devices |
| MERCHANT_STAFF | Admin (SQL today) + `merchant_memberships` row per outlet | Act only on orders of outlets they are a member of; pause outlet; mark dishes sold out |
| RIDER | Admin + `riders` row (`is_approved`) | Go online, stream location, accept/decline **own** offers, advance **own** trip |
| ADMIN | Admin (SQL) | Operations board, any order, discretionary cancel/refund, manual rider assignment |

## Authentication

- `apps/web/src/server/auth-guard.ts` resolves the caller from a **verified** Clerk session JWT
  (`Authorization: Bearer …` or the `__session` cookie): RS256 signature via JWKS, `iss == CLERK_ISSUER`,
  expiry, and `azp` against `CLERK_AUTHORIZED_PARTIES`/`APP_ORIGIN`.
- The role is **always read from `app_users.role`**; token claims never grant roles.
- Demo persona tokens (`demo_customer`, …) exist for local development only. They are refused when
  `APP_ENV` is `staging`/`production`, or `AUTH_DEMO_MODE=false`.

## Order visibility (`server/order-access.ts`)

| Viewer | Sees | Hidden |
|---|---|---|
| Customer (owner) | Everything incl. delivery OTP | Pickup code |
| Merchant (member) | Items, notes, pickup code | Delivery OTP, customer phone |
| Rider (offered/assigned) | Pickup & drop, phone after acceptance | Delivery OTP, pickup code, discount |
| Admin | Everything | — |
| Anyone else | 404 (not 403, so ids cannot be probed) | — |

## Other controls
- Rate limits (Upstash, per user or IP): quotes, checkout, payment verify, search, rider location, OTP attempts.
- Delivery OTP: 5 wrong attempts lock the trip and alert ops; constant-time comparison.
- Webhooks: HMAC-SHA256 over the raw body; durable inbox with retry-safe processing.
- Security headers: CSP (Razorpay/Clerk/Mapbox allow-listed), HSTS, frame-ancestors none, Permissions-Policy.
