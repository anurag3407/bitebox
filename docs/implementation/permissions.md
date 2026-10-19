# Role-Based Access Control (RBAC) & Security Policy

## 1. Actor Roles Matrix

The platform defines 4 primary system roles and merchant staff sub-roles:

| System Role | Scope & Permissions | Key Protected Endpoints |
|---|---|---|
| **CUSTOMER** | Browse restaurants & menus, calculate quotes, create checkouts, verify payments, view personal orders & addresses. | `/api/v1/quotes`, `/api/v1/checkouts`, `/api/v1/orders`, `/api/v1/addresses` |
| **MERCHANT_STAFF** | Access restaurant kitchen console, accept/reject incoming orders, update prep time, mark orders ready for pickup. | `/api/v1/merchant/orders`, `/api/v1/merchant/orders/[orderId]/*` |
| **RIDER** | Broadcast GPS telemetry, receive delivery offers, update trip milestones, verify delivery OTP. | `/api/v1/rider/trip`, `/api/v1/rider/location`, `/api/v1/rider/trip/milestone` |
| **ADMIN** | Access live operational board, trigger manual overrides, issue financial refunds, inspect double-entry ledger. | `/api/v1/admin/orders`, `/api/v1/admin/orders/[orderId]/refund` |

---

## 2. Route Protection and Authentication Guard

In `apps/web/src/server/auth-guard.ts`:
- Incoming requests are resolved via `getAuthenticatedActor(req)`.
- Live authentication uses Clerk JWT verification over the `Authorization: Bearer <token>` header.
- Demo testing persona tokens are supported:
  - `demo_customer` -> Rahul Sharma (`CUSTOMER`)
  - `demo_merchant` -> Chef Vikram (`MERCHANT_STAFF`, Punjabi Angithi)
  - `demo_rider` -> Amit Kumar (`RIDER`)
  - `demo_admin` -> Siddharth (`ADMIN`)
- Unauthorized requests return standard `401 UNAUTHENTICATED` or `403 FORBIDDEN` error envelopes conforming to the platform error contract.
