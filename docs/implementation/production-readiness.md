# Production Readiness Review (2026-10-20)

This records the review of the first implementation, what was fixed, how the system now fits together,
and what still separates it from a Zomato-class product. Each fix has a regression test unless noted.

## 1. Critical defects found and fixed

| # | Defect (before) | Impact | Fix | Test |
|---|---|---|---|---|
| 1 | Clerk adapter accepted **any bearer string** as a logged-in customer; every real JWT mapped to the same account (`clerk_` + first 16 chars, which are identical for all RS256 JWTs) | Total auth bypass and cross-account data mixing | Real RS256 verification against Clerk JWKS (issuer, expiry, `azp`); role read from DB, never the token | `security.test.ts` › Authentication |
| 2 | `mock_valid_sig` accepted as a Razorpay signature **in every environment** | Anyone could mark orders paid without paying | Only honoured when the server itself has mock credentials, which strict envs refuse to boot with | `security.test.ts`, `payments.test.ts` |
| 3 | `GET /admin/orders` had **no auth** | Public leak of every order and customer address | All admin routes require `ADMIN` | `security.test.ts` |
| 4 | Any merchant staff could accept/reject/ready **any restaurant's** orders | Cross-tenant sabotage | Membership check on every merchant action | `security.test.ts` |
| 5 | Any rider/merchant could view any order (IDOR) incl. address & phone | PII leak | Viewer policy (`order-access.ts`): owner / member / assigned rider / admin; others get 404 | `security.test.ts` |
| 6 | Rider milestones: no state machine, any `orderId` accepted, pickup without proof, unlimited OTP guesses | Fake deliveries, OTP brute force (1M space) | Trip state machine, ownership check, pickup code when food not ready, 5-attempt OTP lockout + ops alert | `security.test.ts` › Rider trip integrity |
| 7 | Capture ledger **threw** whenever a coupon or surge applied | Every couponed order failed to record payment | Balanced entries incl. discount expense, surge, tip | `hardening.test.ts` |
| 8 | Refunds were DB rows only, **never sent to Razorpay**; admin refunds marked `PROCESSED` instantly; refundable cap ignored capture status | Customers never got money back; books lied | `RefundRepository.issueWithClient` (capped under row lock) + `REFUND_SUBMIT` job with receipt-based idempotency + status polling + webhooks | `worker.test.ts`, `payments.test.ts` |
| 9 | Webhook failure after inbox insert → redelivery treated as duplicate → **event lost forever**; event id fallback `Date.now()` | Lost captures/refunds | Inbox tracks processing state; only `PROCESSED` is a duplicate; content-hash fallback id | `payments.test.ts` |
| 10 | Second capture on a paid order silently kept; amount never compared to order | Double charges kept | Duplicate & mismatched captures auto-refunded and alerted | `payments.test.ts` |
| 11 | No dispatch: one offer to the first online rider (any distance), never retried; offer timeout job was a no-op | Orders stuck at "ready" forever | Ranked dispatch (distance, ping freshness, exclusions), 45 s offers, re-dispatch on reject/expiry, escalation after ~5 min, maintenance sweep for orphans | `worker.test.ts` |
| 12 | Quote priced a **hard-coded Delhi location** when no address; radius/zone never enforced; other users' address ids accepted | Wrong fees, undeliverable orders | Zone + radius enforcement, address ownership, road distance via Mapbox | `security.test.ts` › Input hardening |
| 13 | Checkout created the Razorpay order **before** the idempotency check; quote not bound to address; one quote → many orders | Duplicate gateway orders/charges | Idempotency fast path, quote↔address binding, `UNIQUE(quote_id)`, pending-order reuse | `order-lifecycle.test.ts`, `payments.test.ts` |
| 14 | Upstash adapter was a per-request `Map` | Rate limiting and live rider locations silently did nothing | Real Upstash REST client (pipeline, TTL), memory fallback only in dev | `order-lifecycle.test.ts` (live location) |
| 15 | Customers could cancel while food was being cooked, with full refund; refunds outside the state-change transaction | Restaurant losses; refunds without cancellation on crash | `CancellationPolicy` + one transaction for state, offers, trip, coupon, refund | `security.test.ts` |
| 16 | Production defaulted every secret to a mock value | A misconfigured deploy ran with fake payments/auth | `APP_ENV=production|staging` refuses insecure config | `security.test.ts` |
| 17 | OTPs / order numbers from `Math.random` (4-char suffix) | Predictable codes, collisions | CSPRNG, 6-char suffix + retry on collision | `hardening.test.ts` |
| 18 | `order_events.sequence` hard-coded to 3; no version column | Audit trail unusable | Gapless sequence per order, optimistic `version` | `order-lifecycle.test.ts` |
| 19 | Deleting an address used by an order → FK error; editing changed order history | Broken address book | Soft delete + address snapshot on the order | `api.test.ts` |
| 20 | Seed re-runs duplicated modifiers/variants; 2 of 3 restaurants had empty menus | Bad demo data | Deterministic ids, full menus, opening hours, realistic coupons | idempotent seed (run twice) |
| 21 | Search interpolated `%`/`_` into `ILIKE` | Wildcard enumeration | Escaped patterns, location-aware results | `security.test.ts` |
| 22 | `deploy.sh` waited for `"status":"ok"` (API returns `healthy`/`ready`) → every deploy "failed"; ran tests against prod; worker image ran `.js` that imports `.ts` | Deploys could not succeed; worker crashed on boot | Migrate service, readiness gate, rollback, `node --import tsx` runtime | **not executed here (no Docker locally)** |
| 23 | Web port published directly, bypassing nginx | Spoofable `X-Real-IP` → rate-limit bypass | Only nginx exposed; nginx overwrites forwarding headers | config review |
| 24 | Internal error messages (SQL, stack text) returned to clients | Information leak | `route()` wrapper: typed `DomainError`s only; everything else logged + generic 500 with request id | all route tests |

## 2. Architecture as built

```
Browser / installed PWA ──HTTPS──► nginx (TLS, per-IP limit, SSE passthrough)
                                     │
                                     ▼
                       Next.js 15 (web, N replicas, stateless)
                       • /api/v1/* route handlers → route() wrapper → auth → domain repos
                       • SSE /orders/:id/live polls shared stores (no sticky sessions)
                                     │
            ┌────────────────────────┼─────────────────────────┐
            ▼                        ▼                         ▼
   PostgreSQL (truth)        Upstash Redis (accelerator)   Providers
   orders, payments, ledger  rate limits, live rider GPS,  Clerk JWKS, Razorpay,
   jobs, outbox, inbox       menu cache (fail-open)        Mapbox, Fast2SMS, Brevo, Web Push
            ▲
            │ SKIP LOCKED leases
   worker (M replicas): timeouts, dispatch, refunds, payment reconciliation,
                        outbox → push/SMS/email, maintenance
```

Key invariants enforced **in the database** (not just code): one order per quote, one live offer per order,
one active trip per rider and per order, one default address per user, gapless order events,
non-negative money, refunded ≤ payable, balanced ledger rows.

Scaling path: web and worker are stateless and horizontally scalable today. Next steps when load demands:
read replica for discovery queries, PgBouncer/Supabase pooler, PostGIS/H3 for dispatch candidate search,
OpenSearch for menu search, and a pub/sub fan-out (Redis Streams) to replace SSE polling beyond ~5k concurrent trackers.

## 3. Zomato parity: what exists now

Customer: location detection + saved addresses, serviceable-only discovery with sort/filters/pagination, opening hours,
favourites, menu search/veg/bestseller, customisation, single-restaurant cart with replace prompt, coupons (limits,
first-order, free delivery) with reasons, rider tip, real Razorpay Checkout, live tracking (SSE + map + ETA from rider
position), delivery OTP, cancellation policy, ratings & reviews, reorder, order history, push notifications, installable PWA
with offline fallback.

Merchant: multi-outlet console, new-order chime, 90 s SLA countdown, prep time, reject reasons, pickup code,
pause orders, sold-out toggles, history. Rider: online/offline, GPS streaming with wake lock, offer accept/decline with
countdown, navigation deep links, pickup code, OTP delivery, failed-delivery flow. Ops: live metrics, stuck-order filter,
order timeline, discretionary refunds/cancels, manual rider assignment, ledger balance check.

## 4. Gaps remaining (prioritised)

**Delivered in the second pass (2026-10-20)** — see §5.
Partner onboarding + admin role management, payouts, GST invoices & credit notes, legal pages
(+ DPDP export/deletion), merchant menu editor, support chat, masked calling.

**Before real launch (P0)**
- Provision Clerk, Razorpay (+ RazorpayX), Upstash, Mapbox, Exotel, Supabase Storage, VAPID keys; run `deploy.sh` on staging. Docker images were **not built in this environment**.
- **Have a CA confirm the GST treatment** (section 9(5) restaurant services at 5% paid by the platform, 18% on delivery/platform fee, intra-state CGST/SGST split, credit-note apportionment at the food rate) and **have counsel review the legal pages**. Inter-state supply (IGST) is not handled.
- KYC verification is manual: admins check FSSAI/PAN/GSTIN/licences outside the app before approving. Integrate a verification API (e.g. FSSAI FoSCoS, NSDL PAN, bank penny-drop) before scaling onboarding.
- Monitoring: ship JSON logs, alert on `/health/ready`, outbox backlog, failed jobs/payouts, ledger imbalance.
- Load test checkout and SSE at expected peak.

**Product parity (P1)**
- Scheduled orders, cash on delivery, rider batching, live surge pricing, membership/referrals/wallet.
- Support: photo attachments, auto-refund rules for common issues, agent assignment/SLAs, canned replies.
- Search ranking with typo tolerance; personalised home feed; restaurant analytics for merchants.
- Merchant-funded coupons and per-restaurant commission management UI; TDS (194-O) on merchant payouts.

**Scale (P2)** — see §2 scaling path; native apps can reuse `@startup/api-client` and `/api/v1` as is.

## 5. Operations features (second pass)

| Feature | How it works | Key safeguards | Tests |
|---|---|---|---|
| Partner onboarding | `/partner` application (restaurant: FSSAI, PAN, GSTIN, pinned location; rider: vehicle, licence) → admin review → one transaction creates merchant + restaurant (paused) + OWNER membership, or rider profile, and sets the role | One open application per user/type; outlet must be inside a service zone; one role per account; audit log | `operations.test.ts` |
| Admin roles | Operations → Users: search, change role, suspend | Cannot change own account; demoting a rider is refused mid-trip and revokes offers; demoting staff deactivates memberships; reason required, audited | `operations.test.ts` |
| Staff | Owners add existing accounts as Manager / Kitchen / Menu editor | Staff roles gate actions: kitchen = orders & stock, editor = menu, manager = outlet settings, owner = staff & payouts | `operations.test.ts` |
| Menu editor | Categories, dishes, portions, add-on groups, photos (Supabase upload or URL), opening hours, fees | Restaurant-scoped writes; child ids preserved so carts stay valid; archive instead of delete; bounds validated; public menu cache invalidated | `operations.test.ts` |
| Payouts | Weekly settlement (Monday 00:00 IST cutoff) of delivered orders → one payout per merchant/rider → RazorpayX transfer, or manual transfer + UTR | Earnings computed by the same `SettlementCalculator` as the capture ledger; unique (order, party) prevents double payment; ₹100 minimum rolls over; provider idempotency key = payout id; bank numbers AES-256-GCM encrypted; ledger posting on payment | `operations.test.ts` |
| GST invoices | Issued by the worker when an order is delivered; printable at `/orders/:id/invoice` | Gapless per-FY numbering via a row-locked sequence (rollback-safe), ≤16 chars; immutable snapshot; credit note for every processed refund on an invoiced order | `operations.test.ts`, `hardening.test.ts` |
| Legal & privacy | `/legal/{terms,privacy,refunds,grievance}` reflecting the policies the code enforces; account → download data / delete account | Deletion refused mid-order and for partners; personal data scrubbed, tax records kept anonymised; Clerk user deleted | `operations.test.ts` |
| Support chat | "Get help" on an order → ticket chat; agent queue with refund and resolve | One open ticket per order; customers see only their tickets; agent replies push-notify; customer reply reopens | `operations.test.ts` |
| Masked calling | `POST /orders/:id/call` → Exotel rings the caller and bridges from a virtual number | Numbers removed from all order/tracking payloads; who-can-call-whom and when enforced server-side; rate limited; every call logged. Without Exotel the number is revealed only to an authorised participant | `operations.test.ts` |
