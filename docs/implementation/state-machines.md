# State Machines & Lifecycle Transitions

All platform domain state mutations are governed by pure finite state machines defined in `@startup/core`.

## 1. Order Fulfillment State Machine (`OrderStateMachine`)

Governs the complete lifecycle of customer orders from initial placement to delivery or cancellation:

```text
       [ PENDING_PAYMENT ]
               │
               ▼ (Payment Verified)
       [ AWAITING_MERCHANT ] ──(Merchant Reject / 90s SLA Timeout)──► [ CANCELLED ] (Auto Refund)
               │
               ▼ (Merchant Accepts)
          [ ACCEPTED ]
               │
               ▼ (Kitchen Prepares)
         [ PREPARING ]
               │
               ▼ (Food Packaged)
     [ READY_FOR_PICKUP ]
               │
               ▼ (Rider Confirms Pickup)
     [ OUT_FOR_DELIVERY ]
               │
       ┌───────┴────────────────────────┐
       │ (Valid 6-Digit Delivery OTP)    │ (Unreachable / Damaged)
       ▼                                ▼
  [ DELIVERED ]                  [ DELIVERY_FAILED ]
```

### Transition Table & Rules:
- `PENDING_PAYMENT` -> `AWAITING_MERCHANT`
- `AWAITING_MERCHANT` -> `ACCEPTED` | `CANCELLED`
- `ACCEPTED` -> `PREPARING` | `CANCELLED`
- `PREPARING` -> `READY_FOR_PICKUP` | `CANCELLED`
- `READY_FOR_PICKUP` -> `OUT_FOR_DELIVERY` | `CANCELLED`
- `OUT_FOR_DELIVERY` -> `DELIVERED` | `DELIVERY_FAILED`
- Terminal states: `DELIVERED`, `CANCELLED`, `DELIVERY_FAILED`. No transitions are permitted out of terminal states.

---

## 2. Delivery Trip State Machine

Governs rider milestone transitions:

```text
[ OFFERED ] ──(Accept Offer)──► [ ACCEPTED ]
                                     │
                                     ▼
                           [ ARRIVED_AT_STORE ]
                                     │
                                     ▼ (Verify Order Number)
                               [ PICKED_UP ]
                                     │
                                     ▼
                         [ ARRIVED_AT_CUSTOMER ]
                                     │
                                     ▼ (Verify 6-digit Customer OTP)
                               [ COMPLETED ]
```

---

## 3. Payment Attempt State Machine (`PaymentStateMachine`)

- `CREATED` -> `AUTHORIZED` -> `CAPTURED`
- `CREATED` / `AUTHORIZED` -> `FAILED`
- Order Funding Guard ensures an order can never have duplicate active captures or conflicting payment paths.
