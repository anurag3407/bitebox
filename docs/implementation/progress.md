# Implementation Progress & Milestone Tracking

## Phase Status Summary

| Phase | Milestone Description | Status | Verification Evidence |
|---|---|---|---|
| **Phase 0** | Workspace Scaffolding, Base Types & Contracts | **COMPLETE** | Root pnpm monorepo, `packages/contracts` tests passing (4/4) |
| **Phase 1** | Pure Core Domain, Money, State Machines & Policies | **COMPLETE** | `packages/core` tests passing (16/16), zero framework deps |
| **Phase 2** | PostgreSQL Schema, Migrations, Repositories & Seeds | **COMPLETE** | `packages/database` integration tests (5/5) against PostgreSQL 15 |
| **Phase 3** | Integration Adapters (Clerk, Razorpay, Upstash, Mapbox, Fast2SMS, Brevo) | **COMPLETE** | HMAC SHA256 signature verification, demo persona resolution |
| **Phase 4** | Durable Background Worker Daemon | **COMPLETE** | `apps/worker` timeout and refund test passing (1/1) |
| **Phase 5** | Next.js 15 Web Monolith (Customer, Merchant, Rider, Admin UI & APIs) | **COMPLETE** | Next.js 15 production standalone build passing (26/26 routes) |
| **Phase 6** | Infrastructure, Docker, Nginx, CI/CD & Runbooks | **COMPLETE** | Dockerfiles, Compose, Nginx config, deploy scripts, 14 runbooks |

---

## Detailed Deliverables Completed

### 1. Monorepo Infrastructure
- Configured pnpm workspaces with 9 packages and apps.
- Enforced strict TypeScript configuration (`ES2022`, `Bundler` module resolution, `strict: true`, `noUncheckedIndexedAccess: true`).
- Pinned dependency versions across React 19, Next.js 15, Drizzle ORM, Vitest, and Tailwind CSS.

### 2. Contracts & Domain Core
- Created comprehensive state enums: `FulfillmentState`, `PaymentAttemptStatus`, `PaymentStatus`, `RefundStatus`, `DeliveryTripStatus`, `UserRole`, `MerchantStaffRole`.
- Implemented `Money` value object with exact integer paise arithmetic, formatting, and basis point fee calculations.
- Implemented `OrderStateMachine` with guarded fulfillment transitions and cancellation rules.
- Implemented `PricingCalculator` with dynamic surge pricing, distance tiers, restaurant packaging, platform fee, GST computation, and coupon discount validation.
- Implemented `DispatchEngine` with candidate filtering (online, idle, within range) and travel-time ranking.
- Implemented `LedgerEngine` with double-entry balanced accounting entries (`sum(debit) == sum(credit)`).

### 3. Database & Repositories
- Defined 18+ PostgreSQL tables in Drizzle ORM covering users, restaurants, menu items, modifier groups, quotes, orders, order items, payments, refunds, riders, delivery trips, rider locations, jobs, idempotency records, webhook inbox, and ledger entries.
- Executed initial schema migration (`0001_initial.sql`) creating all tables, indexes, and foreign keys.
- Executed deterministic seed script populating Central Delhi / Connaught Place zone, 3 premier partner restaurants (Punjabi Angithi, Bikanervala, The Burger Club) with multi-category menus, modifier groups, sample customer address, test rider, and promo coupons (`WELCOME50`, `FLAT100`).
- Implemented transactional repositories: `RestaurantRepository`, `AddressRepository`, `OrderRepository` (with atomic creation and capture), `RiderRepository` (with atomic offer acceptance), `JobRepository` (with `FOR UPDATE SKIP LOCKED`), and `LedgerRepository`.

### 4. Background Worker Daemon
- Implemented polling daemon claiming jobs via `SKIP LOCKED`.
- Implemented `MERCHANT_ACCEPTANCE_TIMEOUT` handler that automatically cancels unaccepted orders after 90 seconds, initiates full refunds, records ledger entries, and sends transactional notifications.

### 5. Multi-Actor Web Experience
- **Customer**: Zomato-inspired discovery feed with live search, cuisine carousels, restaurant cards, dynamic item modifier customizer modal, persistent cart drawer, checkout with Razorpay payment modal, live order timeline tracker, and account order history.
- **Merchant**: Kitchen console with incoming order alerts, 90-second acceptance SLA countdown timer, kitchen preparation time selection, and ready-for-pickup triggers.
- **Rider**: Fleet portal with active delivery trip view, navigation route overview, milestone transitions (Arrived at Store, Picked Up, Arrived at Customer), and 6-digit secure delivery OTP handshake verification.
- **Admin**: Live operational command board showing active platform orders, state transition overrides, and one-click financial refund processing with automatic ledger posting.
- **Authentication**: Seamless persona switcher allowing instant toggling between Customer (Rahul), Merchant (Vikram), Rider (Amit), and Admin (Siddharth) across all pages.


---

## 2026-10-20: Production hardening pass

The milestones above described a demo. A review found critical issues (auth bypass, payment-signature bypass,
unauthenticated admin API, refunds never sent to the gateway, no working dispatch, ledger failures on coupons).
See [production-readiness.md](production-readiness.md) for the full list, fixes, architecture and remaining gaps.

Verification evidence for this pass:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: 92 tests across 9 files pass against a fresh PostgreSQL 15 database, repeatably.
  Includes a full browse→pay→cook→dispatch→deliver→rate flow through real route handlers and the worker,
  security tests with real RS256 JWTs, payment/webhook edge cases and worker failure modes.
- `next build` succeeds (production). Manual HTTP smoke test of the production build with the worker running:
  quote → checkout → payment → merchant accept → worker dispatch → rider pickup → SSE tracking → OTP delivery → rating,
  ledger balanced and outbox drained.
- Not verified here: Docker image builds / compose deployment (Docker unavailable), real Clerk / Razorpay / Upstash /
  Mapbox / Fast2SMS / Brevo / Web Push credentials, and browser UI (pages return 200 and build cleanly but were not
  exercised in a browser).

---

## 2026-10-26: Zomato-parity pack (growth, trust, dining, post-order)

A new end-to-end slice was added on top of the existing platform. The full feature matrix and the
remaining parity backlog live in [zomato-parity.md](zomato-parity.md).

Delivered:
- **Refer & earn** with per-user codes, share links, signup capture, first-delivery qualification,
  both-sided wallet rewards and abuse controls.
- **BiteBox Credits wallet** with typed ledger transactions, idempotent credits, full-credit
  checkout, cancellation refunds back to credits and account activity.
- **Cash on delivery** (no gateway attempt) and **wallet payments** in checkout, plus cash
  collection and `CASH_IN_TRANSIT` ledger accounting at the door.
- **Rider KYC** (profile photo, Aadhaar, DL, RC), submission, admin approve/reject/suspend and a
  hard gate before a rider can go online.
- **Delivery verification**: OTP handshake plus doorstep photo proof; contactless deliveries
  cannot complete without a photo.
- **In-order chat** between customer and rider / customer and restaurant with participant checks.
- **Problem reporting** with bounded instant wallet remedies, duplicate blocking and non-delivery
  escalation to priority support; admin wallet/refund/coupon resolution.
- **Dining reservations** with real-time slot capacity, confirmation codes, cancellation, calendar
  export, customer bookings and a merchant dine-in console.
- **Scheduling, contactless, cutlery and handover preferences** in checkout, with dispatch anchored
  to the requested slot.
- **Safety**: SOS opens a priority support conversation, trusted contacts, 112 action and a
  privacy-safe expiring public tracking link.
- **Search autocomplete**, a dedicated **cart page**, **notification preferences** and authenticated
  image uploads with a local database fallback.
- Admin screens for rider KYC, problem remedies and referrals; merchant dine-in screen; rider KYC
  screen; customer credits/referrals/dining/safety surfaces.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **141 tests in 13 files pass**, including 10 parity tests for referrals, wallet
  payment/refund, COD contactless delivery, proof enforcement, chat, KYC gating, instant remedies,
  dining, public tracking and SOS.
- `next build` (production) succeeds.
- Browser smoke tested: dining listing and slots, account credits/referrals/preferences/safety,
  rider KYC, admin KYC, merchant dine-in, cart, checkout with COD, live order page, safety modal,
  share-link creation and the public `/track/:token` page.


## 2026-10-26 (continued): pickup, Gold, reviews, notifications

Delivered:
- **Self-pickup** end-to-end: address-optional quote, zero delivery fee, no rider dispatch or
  rider assignment, restaurant-verified pickup code handover (merchant endpoint), customer
  pickup code, pickup tracking timeline and pickup-safe invoices.
- **Loyalty**: 2% cashback in BiteBox Credits on every delivered order (capped at ₹50), with an
  idempotent `CASHBACK` wallet entry and no double-counting of order ledger totals.
- **BiteBox Gold**: earned after five delivered orders and purchasable for ₹99/30 days through
  Razorpay. Free delivery above ₹199 is applied in quoting; purchases are idempotent, recorded in
  `membership_purchases`, posted to the ledger and surfaced in Account > GOLD.
- **Rich reviews**: up to three photos, dish-level ratings, restaurant replies and a merchant
  Reviews console. Public review cards show photos, dish scores and replies.
- **In-app notifications**: durable notification rows generated by the outbox worker for order,
  refund, referral, Gold, cashback, support, issue and dining events; unread header bell plus a
  full `/notifications` page with mark-read.
- **Pickup invoices** no longer depend on a delivery address row, and payment mode on invoices now
  reflects Razorpay / credits / cash.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **147 tests in 13 files pass**, including 16 parity tests.
- `next build` production build succeeds.
- Browser smoke verified pickup checkout (zero delivery fee, COD disabled, pickup address/code),
  Gold activation via simulated Razorpay, unread notification bell + `/notifications`, and the
  existing dining, KYC, admin, merchant and tracking flows.


## 2026-10-26 (continued): menu detail, gallery, veg mode and recents

Delivered:
- **Dish detail parity**: allergens, nutrition (calories/protein/carbs/fat), spice level and
  serving size on menu cards and the dish customiser, with merchant fields in the menu editor.
- **Restaurant detail**: amenities and a photo gallery, editable from outlet settings and shown
  on the storefront.
- **Food preferences**: a persistent veg mode used by home and search, plus recent searches with
  individual chips and clear-all on the search screen.
- Seed data enriched for the demo outlet and its signature dishes so the flows are visible
  immediately.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **148 tests in 13 files pass**, including 17 parity tests.
- `next build` production build succeeds.
- Browser smoke verified gallery/amenities/dish metadata on the restaurant page, restored recent
  searches and veg mode on search, and the food-preferences control in Account > Profile.


## 2026-10-26 (continued): order for someone else

Delivered:
- **Gift orders**: checkout collects recipient name, mobile number and a gift message; pickup
  orders reject gifting; recipient details are snapshotted with the order and shown to the
  customer, rider and merchant.
- **Recipient-aware masked calling**: riders/restaurants calling “customer” now reach the
  recipient, while the customer's own caller identity stays their account phone. Recipient
  numbers are never returned to riders in order payloads.
- **Gift experience**: order page shows the recipient and gift message, OTP copy tells the
  customer to share the code with the recipient, and the rider screen labels the recipient and
  call action.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **150 tests in 13 files pass**, including 19 parity tests.
- `next build` production build succeeds.
- Browser smoke placed a gift COD order end-to-end and verified the recipient details, gift
  message and delivery-code copy on the live order page.


## 2026-10-26 (continued): post-delivery tips

Delivered:
- **Post-delivery tipping** from BiteBox Credits with one tip per delivered order, a 7-day
  window, rider-required enforcement and duplicate blocking.
- Tips are recorded as `RIDER_TIP` wallet debits, posted to `RIDER_PAYABLE`, and tracked as
  separate `payout_items.tip_id` rows so an already-settled order can still be tipped and each
  tip reaches the rider exactly once.
- Order page shows a tip card with credit balance and ₹20/₹30/₹50 actions, then a thank-you
  state after tipping. Pickup orders hide tipping because there is no rider.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **151 tests in 13 files pass**, including 20 parity tests.
- `next build` production build succeeds.
- Browser smoke tipped a delivered gift order from a ₹500 credits balance and confirmed the
  paid state rendered.


## 2026-10-26 (continued): merchant promotions

Delivered:
- **Outlet promotions**: OWNER/MANAGER staff can create percentage, flat or free-delivery coupons
  scoped to their restaurant with minimum order, maximum discount, validity window, total uses
  and first-order-only rules.
- Coupons carry redemption/reservation counts in the merchant console, can be paused/resumed,
  and immediately appear in the customer checkout offers list and apply through the existing
  quote/coupon engine.
- Promotions are platform-funded in this preview; the catalog records merchant-funded payout
  settlement as the remaining step.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **152 tests in 13 files pass**, including 21 parity tests.
- `next build` production build succeeds.
- Browser smoke rendered the merchant Promotions tab with offer stats, empty state and creation
  controls.


## 2026-10-26 (continued): surplus rescue bags

Delivered:
- **Surplus rescue bags** are now a real paid flow instead of a simulated reservation. Each
  bag shows the restaurant hero image, cuisines, rating, address, discount, pickup window and
  live stock on `/surplus`.
- Purchasing debits BiteBox Credits, atomically decrements listing stock, creates a
  `PICKUP` order at `READY_FOR_PICKUP`/`CAPTURED`, issues a pickup code instantly, records the
  wallet payment reference and posts a balanced order-capture ledger with zero commission.
- Insufficient credits disable the action and point to wallet top-up and refer & earn; the
  unsafe reserve-without-payment endpoint was removed.
- The demo seed includes a live rescue bag so the flow is testable end-to-end.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **153 tests in 13 files pass**, including 22 parity tests.
- `next build` production build succeeds.
- API smoke: purchase returned 201 with a `WALLET` pickup order; DB confirmed
  `READY_FOR_PICKUP`/`CAPTURED`, pickup code `0160`, stock 8→7, wallet ₹480→₹331 and a single
  `ORDER_PAYMENT` debit transaction.


## 2026-10-26 (continued): rider quests and shift booking

Delivered:
- **Delivery quests**: riders see active incentives with live delivery progress, time left and
  reward. Claims are one-time, validated against completed deliveries inside the quest window,
  and post a balanced `RIDER_INCENTIVE_EXPENSE`/`RIDER_PAYABLE` ledger transaction so the bonus
  is included in the next weekly payout as its own payout item.
- **Shift booking**: upcoming capacity-limited slots with spots left; riders can book, cancel
  and rebook. Booking blocks overlaps with other active shifts and refuses full slots under a
  row lock, so two riders cannot take the last seat.
- The Rider console now has a fourth **Rewards** tab with quest cards, progress bars, claim
  actions and shift cards; deep links support `?tab=rewards`.
- Seeds include two quests and three upcoming shift slots for the demo rider.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **154 tests in 13 files pass**, including 23 parity tests.
- `next build` production build succeeds.
- Browser smoke: the Rewards tab rendered both quests and shift slots; booking changed the
  card to “You’re booked” and persisted `BOOKED`, then cancel persisted `CANCELLED` and
  released the capacity.


## 2026-10-26 (continued): meal passes

Delivered:
- **Meal pass purchase is now payment-backed**: passes are bought with BiteBox Credits through
  a new `MEAL_PASS_PAYMENT` wallet transaction, retiring wallet liability and booking deferred
  revenue in one transaction. Insufficient credits leave no pass behind.
- **Auto-scheduling**: purchase immediately creates the next five weekday deliveries from the
  plan's schedule (skipping weekends and dates beyond validity), with idempotent inserts shared
  with the nightly generation job.
- **Customer page `/meal-pass`**: plan cards with per-meal pricing, weekday schedule and
  validity; pass cards with meals left and expiry; upcoming-meal list with one-tap Skip and the
  90-minute late-skip explanation. Header links added.
- Seeds include a 3-meal trial pass and a 10-meal weekday pass.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **155 tests in 13 files pass**, including 24 parity tests.
- `next build` production build succeeds.
- Browser smoke: bought the ₹299 trial pass with ₹331 credits; wallet dropped to ₹32, pass
  showed 3 meals remaining, and five weekday lunches were scheduled with Skip actions.


## 2026-10-26 (continued): corporate lunch club

Delivered:
- **Corporate overage is now really paid**: corporate orders no longer record a simulated
  captured payment. The employee share is debited from BiteBox Credits, recorded as an
  `ORDER_PAYMENT`, and the ledger moves wallet liability into gateway clearing while the
  company share is posted to `CORPORATE_RECEIVABLE`.
- **Membership API and page**: `/corporate` shows company, cost centre, daily allowance,
  today's usage, remaining allowance, drop point and unbilled balance, with a marketing and
  enrolment explainer for non-members.
- **Checkout integration**: members see a corporate allowance switch, a live company/employee
  split preview, the adjusted “You pay” total and a credits-only overage action. Corporate is
  limited to weekday lunch (11am–3pm IST), delivery orders and immediate checkout; the
  switch disables itself outside those conditions.
- Seeds include the Northstar Labs account and the demo customer as an ENG-01 employee.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **156 tests in 13 files pass**, including 25 parity tests.
- `next build` production build succeeds.
- Browser smoke: `/corporate` rendered the Northstar Labs allowance, usage, cost centre and
  drop point for the demo customer. `/checkout` rendered the corporate allowance switch and
  correctly disabled it outside the 11am–3pm IST lunch window.


## 2026-10-26 (continued): gift cards

Delivered:
- **Gift cards** in ₹100–₹10,000 denominations, bought with BiteBox Credits and issued with a
  one-time `BXG-XXXX-XXXX` code valid for 365 days.
- Purchases move wallet liability into a new `GIFT_CARD_LIABILITY` account; redemption moves
  it into the recipient's wallet with `GIFT_CARD_REDEEM`, so credits are never conjured and
  the card pays out exactly once.
- Self-redemption, duplicate redemption and expired cards are blocked. Purchasers can copy the
  code and see recipient, message, status and expiry in `/gift-cards`; recipients redeem into
  their credits on the same page.
- Header account menu links to Gift cards.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **157 tests in 13 files pass**, including 26 parity tests.
- `next build` production build succeeds.
- Browser smoke: `/gift-cards` rendered the amount picker, recipient fields, redeem box and
  empty sent-list state with the demo wallet balance.


## 2026-10-26 (continued): merchant chat and KOT

Delivered:
- **Restaurant-to-customer chat**: every live merchant order card has a “Message customer”
  action that opens the existing order chat on the `CUSTOMER_MERCHANT` channel, with restaurant
  quick replies. Merchants are restricted to their own outlet's orders and that channel only.
- **Printable KOT**: “Print KOT” opens a clean kitchen ticket with order number, mode, time,
  quantities, variants/options, item notes, customer note and a no-cutlery flag, then triggers
  the browser print dialog. It is safe to reprint at any point.
- Chat remains closed for terminal orders; KOT printing stays available.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **158 tests in 13 files pass**, including 27 parity tests.
- `next build` production build succeeds.
- Browser smoke: merchant Live orders showed both actions; the chat modal opened and the sent
  quick reply was persisted as a `MERCHANT` message on `CUSTOMER_MERCHANT`.


## 2026-10-26 (continued): admin operations console

Delivered:
- **Admin Ops tab**: live queue health by status, recent jobs, failed jobs with their last
  error and a one-click retry that resets attempts and schedules the job immediately, plus
  zone/drop-point/batch counts and a global privileged-action audit trail.
- **Job replay API** only accepts failed jobs and writes a `JOB_RETRY` audit entry; a second
  retry of an already-requeued job returns a conflict.
- **Zone oversight** lists every cluster with active state, drop-point count, batch count and
  the batching threshold.
- Admins can see the same audit trail that records refunds, KYC decisions, payouts and now
  job replays.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **159 tests in 13 files pass**, including 28 parity tests.
- `next build` production build succeeds.
- Browser smoke: Admin Ops rendered queue health, the failed job and Retry action, recent
  jobs, the seeded corporate zone and the audit section.


## 2026-10-26 (continued): community kitchen donations

Delivered:
- **Donations from BiteBox Credits**: ₹10–₹1,000 amounts, paid instantly, with receipt codes,
  lifetime totals and a history on `/donate`.
- Donations debit wallet liability into a new `DONATION_PAYABLE` pass-through account, keeping
  them separate from platform revenue until the foundation disburses the fund.
- Insufficient credits leave no donation behind; the page links to wallet top-up and gift-card
  redemption.
- Header account menu links to “Donate a meal”.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **160 tests in 13 files pass**, including 29 parity tests.
- `next build` production build succeeds.
- Browser smoke: donated ₹10 with the demo customer; wallet dropped ₹32→₹22, receipt
  `DON-3EFE27E9` appeared, and the lifetime total updated to ₹10.


## 2026-10-26 (continued): merchant rescue bags

Delivered:
- **Merchant Rescue tab**: view live bags, units left and sold counts; publish a bag with a
  title, original value, discount, platform fee, quantity and pickup window; preview the
  customer price and merchant proceeds before publishing; pause and resume listings.
- **Merchant listing APIs** scoped by restaurant access: GET/POST/PATCH under
  `/merchant/restaurants/:id/surplus`, rejecting windows in the past, invalid discount ranges,
  non-positive proceeds and staff from other outlets.
- Pausing hides the bag from the customer Rescue storefront immediately; resuming restores it
  while stock and the pickup window remain valid.
- Customers still reserve with credits and collect with a pickup code; sold counts read from
  the linked surplus orders.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **161 tests in 13 files pass**, including 30 parity tests.
- `next build` production build succeeds.
- Browser smoke: Merchant Rescue rendered live-bag/units/sold stats, the seeded bag with Pause,
  and the publish form with a ₹180 customer price and ₹161 merchant proceeds preview.


## 2026-10-26 (continued): order add-ons

Delivered:
- **One-tap add-ons** on active orders: the order page shows up to three in-stock extras with
  prices, paid from BiteBox Credits, and adds them to the same bag without extra delivery or
  platform fees.
- Add-on payment is now real: the child order is `WALLET`/`CAPTURED`, records a wallet debit
  and payment reference, posts a balanced capture ledger, and rolls back stock/payment if
  credits are insufficient.
- The upsell list drops a SKU when stock reaches zero; the parent bag label updates for the
  kitchen and rider.
- Seeds include Masala Chaas so the add-on card is visible on live demo orders.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **162 tests in 13 files pass**, including 31 parity tests.
- `next build` production build succeeds.
- Browser smoke: the live COD order page rendered the add-on card with Masala Chaas ₹20 and
  the no-extra-fee copy.


## 2026-10-26 (continued): personalized home feed

Delivered:
- **Cuisine affinity** from delivered orders (top three cuisines with order counts and last
  ordered time).
- **Order again** rail of recently delivered kitchens, and a **For you** rail headed
  “Because you ordered X” that recommends nearby kitchens not already in Order again, filled
  with top-rated fallbacks when affinity candidates run out.
- Anonymous or new customers get a top-rated “Popular near you” rail with no reorder section.
- The feed respects the customer's saved delivery location for distance/serviceability and
  reuses the existing restaurant cards and favourite actions.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **163 tests in 13 files pass**, including 32 parity tests.
- `next build` production build succeeds.
- Browser smoke: home rendered Order again (Punjabi Angithi) and For you (“Because you
  ordered Biryani”) with nearby new kitchens, excluding the reorder restaurant.


## 2026-10-26 (continued): corporate admin console

Delivered:
- **Admin Corporate tab**: company list with GSTIN, drop point, allowance, subsidy, fee,
  employee/invoice counts, unbilled balance and credit limit.
- **Company creation** with GSTIN validation, drop-point picker, daily allowance, subsidy,
  management fee and monthly credit limit.
- **Employee enrolment by email** (resolved to a customer account) with cost centre codes,
  and a per-company monthly invoice action using the existing consolidated GST invoice engine.
- Added admin-only drop-point listing for account setup; non-admins are rejected.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **164 tests in 13 files pass**, including 33 parity tests.
- `next build` production build succeeds.
- Browser smoke: Admin Corporate rendered Northstar Labs with GSTIN, drop point, allowance,
  subsidy, employees, credit limit and Add employee/Invoice actions.


## 2026-10-27 (continued): rider accident cover

Delivered:
- **Partner Accident Cover** for KYC-verified riders: ₹5,00,000 accidental cover and ₹50,000
  hospital cash, platform-paid, activated from the Rider Rewards tab for one year.
- **Incident claims** with type, date, claimed amount and description; only active policies can
  claim, incidents must fall inside the policy period, and amounts are capped by cover.
- **Admin Insurance tab** with pending/approved stats, rider contact, claim details, approve
  amount and rejection notes. Approvals post `RIDER_INSURANCE_EXPENSE`/`RIDER_PAYABLE` and add a
  dedicated payout item so the claim settles with the rider's next payout.
- Unverified riders are blocked from activating cover; claims are one-time reviewed.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **165 tests in 13 files pass**, including 34 parity tests.
- `next build` production build succeeds.
- Browser smoke: activated cover for the demo rider; DB showed an active ₹5,00,000 policy valid
  to 27 Oct 2027, and the claim form rendered.


## 2026-10-27 (continued): editable delivery zones

Delivered:
- **Zone creation** from a city, centre latitude/longitude and radius; the server generates a
  ten-point polygon so admins do not edit raw GeoJSON.
- **Drop-point management** per zone and pause/reactivate controls, with counts of drop points
  and batches in the Ops console.
- Every zone and drop-point change writes an audit entry (`ZONE_CREATED`,
  `DROP_POINT_CREATED`, `ZONE_PAUSED`/`ZONE_ACTIVATED`).
- Paused zones disappear from active drop-point pickers used by corporate setup.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **166 tests in 13 files pass**, including 35 parity tests.
- `next build` production build succeeds.
- Browser smoke: Ops rendered the seeded zone with its drop point and Pause action; Add zone
  revealed the city, centre and radius form.


## 2026-10-27 (continued): batch operations

Delivered:
- **Per-zone batch candidates**: paid, unbatched orders grouped by slot with order and drop
  counts, ready for dispatch.
- **One-click batch lock** with batch window, generated drop sequence/manifest, bag counts and
  captain payable; orders are attached to the batch and no longer appear as candidates.
- **Recent batches** with status, slot, order/drop counts, plus a `BATCH_LOCKED` audit entry.
- Batches remain accessible from each zone card in Ops.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **167 tests in 13 files pass**, including 36 parity tests.
- `next build` production build succeeds.
- Browser smoke: Ops > Batches opened for the seeded zone and rendered the empty candidates
  state.


## 2026-10-27 (continued): language preference

Delivered:
- **English/Hindi language setting** stored on `app_users.language`, exposed on `/me` and
  updated through `/api/v1/me/language`.
- The choice persists on the device and immediately translates the header account menu,
  desktop shortcuts, mobile tab bar, account tabs and home section headings.
- Account > Profile has a language block with English/हिन्दी choices; the page explains that
  deeper screens are still being translated.
- Invalid languages are rejected and unauthenticated requests return 401.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **168 tests in 13 files pass**, including 37 parity tests.
- `next build` production build succeeds.
- Browser smoke: switching to हिन्दी translated the account tabs and bottom navigation; the
  database stored `language = 'hi'`.


## 2026-10-27 (continued): batch rider assignment

Delivered:
- **Assign or clear a rider** on a locked dispatch batch from Ops, with approved-rider
  validation, rider name/online state in the picker and the assigned name on the batch row.
- `PATCH /admin/zones/:zoneId/batches/:batchId` refuses batches that are completed/cancelled
  and writes `BATCH_RIDER_ASSIGNED`/`BATCH_RIDER_UNASSIGNED` audit entries.
- Unassignment is supported for re-planning before dispatch.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **168 tests in 13 files pass**, including 37 parity tests (batch test now covers
  rider assignment and clearing).
- `next build` production build succeeds.


## 2026-10-27 (continued): merchant-funded coupons

Delivered:
- **Merchant-funded offers**: coupons created in the merchant console are tagged
  `funded_by = MERCHANT`; checkout snapshots the discount onto the order, reduces the merchant
  payable and the next payout, and does not post a platform `DISCOUNT_EXPENSE` entry.
- **Platform-funded coupons** (seeded campaigns) remain unchanged and continue to be absorbed
  by the platform.
- The Promotions tab labels outlet coupons “Merchant-funded” and explains the payout deduction.
- The ledger balances by reducing merchant payable by the funded discount; any remainder beyond
  merchant earnings falls back to platform discount.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **168 tests in 13 files pass**, including 37 parity tests (promotions test now
  asserts the stored merchant discount, reduced payable and absent platform discount).
- `next build` production build succeeds.


## 2026-10-27 (continued): rider kit issuance

Delivered:
- **Rider kit records** for helmets, delivery bags, t-shirts and insurance cards, with size,
  notes, status and issuing admin.
- **Admin Insurance tab** can issue kit to any approved rider; repeated issuance updates the
  same item instead of duplicating it, and every issue writes a `RIDER_KIT_ISSUED` audit entry.
- **Rider Rewards** shows a kit checklist with issued dates or “Not issued”.
- Equipment is per rider/item unique, so the rider always has one current record per item.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **169 tests in 13 files pass**, including 38 parity tests.
- `next build` production build succeeds.
- Browser smoke: Helmet showed “Issued 27 Oct” for the demo rider; bag, t-shirt and insurance
  card showed “Not issued”.


## 2026-10-27 (continued): promotion reporting

Delivered:
- **Merchant-funded spend** per coupon, derived from redeemed discounts, alongside delivered
  attributed food revenue and a revenue-per-₹1 return.
- Portfolio totals at the top of the Promotions tab (funded spend, attributed revenue, return).
- Per-offer rows now show funded spend and delivered revenue alongside redemption counts.
- The report reads only delivered orders for revenue, so pending or cancelled orders do not
  inflate campaign ROI.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **169 tests in 13 files pass**, including 38 parity tests (promotions test now
  asserts funded spend and zero attributed revenue for a pending order).
- `next build` production build succeeds.
- Browser smoke: Promotions rendered the merchant-funded explanation and zero-state offers.


## 2026-10-27 (continued): campus meal clusters

Delivered:
- **Campus directory** from clusters that have active meal plans and drop points, with a server-side `CampusRepository` and `/api/v1/campus`.
- **Campus lunch passes** scoped to the cluster, kept out of the general meal-pass list, with hostel-gate drop-point selection and wallet purchase.
- **`/campus` storefront** with campus cards, active plan pricing/validity and a clear credits-shortfall state.
- Seed data for IIT Delhi and a 5-lunch campus pass.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **170 tests in 13 files pass**, including 39 parity tests.
- `next build` production build succeeds.
- Browser smoke: `/campus` rendered IIT Delhi, Hostel Gate 1 and the ₹399/5-meal plan.


## 2026-10-27 (continued): sponsored placements

Delivered:
- **Paid boosts** for 3, 7 or 14 days at ₹99/day, bought from the merchant’s BiteBox Credits; repeated buys extend an active placement.
- Sponsored restaurants carry a **Sponsored** label and a relevance lift in discovery ranking; the flag is added to the restaurant summary DTO.
- Wallet debit posts to `PLATFORM_REVENUE`, every purchase writes an audit entry, and merchant Growth shows the active days remaining.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **171 tests in 13 files pass**, including 40 parity tests.
- `next build` production build succeeds.
- Browser smoke: Growth rendered the Sponsored placement card with ₹99/day and 3/7/14-day options.


## 2026-10-27 (continued): split the bill

Delivered:
- **Host-created bill splits** on delivered orders for 2–10 friends, with equal shares and rounding handled down to the paisa.
- **Public split page** at `/split/[token]`: order context, share progress, wallet balance and one-tap payment from BiteBox Credits.
- Payments move credits from the friend to the host with `SPLIT_PAYMENT`/`SPLIT_RECEIVED` wallet entries and balanced wallet-liability postings; duplicate, host, full and settled payments are blocked.
- The order page shows the share link, pending/paid state and a settled badge.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **172 tests in 13 files pass**, including 41 parity tests.
- `next build` production build succeeds.
- Browser smoke: created three shares from a delivered order and opened the public split page as the host.


## 2026-10-27 (continued): hygiene ratings

Delivered:
- **Outlet hygiene rating** (1–5) set from merchant outlet settings, validated by the shared settings schema and exposed on restaurant detail.
- Restaurant pages show the hygiene score next to rating, delivery time and price.
- Seeds give the demo restaurants a 4/5 rating when none is set.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **173 tests in 13 files pass**, including 42 parity tests.
- `next build` production build succeeds.


## 2026-10-27 (continued): kit return and loss

Delivered:
- Admins can mark an issued kit item **returned** or **lost**; the rider checklist reflects the new status.
- Changes are audited (`RIDER_KIT_RETURNED`/`RIDER_KIT_LOST`) and only apply to items already issued.
- The admin Insurance tab shows the selected rider’s kit with Return/Lost controls.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **170 tests in 13 files pass**, including 39 parity tests.
- `next build` production build succeeds.

## 2026-10-27 (continued): group ordering

Delivered:
- **Shared group carts** per restaurant: the host creates a group from the restaurant page and shares an 8-character invite code/link; up to 12 people join by opening it.
- Members add their own dishes with portions, modifiers and cooking notes; each line is priced from live menu data and can only be edited or removed by that member (the host can edit any line).
- The shared-bill panel groups dishes by person, shows each member's subtotal, supports quantity changes and removing lines, and surfaces the host checkout action.
- Hosts can **lock** the cart, **reopen** it for late dishes, and hand the combined bill to the normal checkout flow; on a successful order the group is marked completed with the order link.
- Empty, locked, expired and completed states are handled, including an expiry timestamp and a sign-in path for guests opening the link.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **174 tests in 13 files pass**, including 43 parity tests.
- `next build` production build succeeds.
- Browser smoke: created a group order, added a dish on `/group/:code`, locked it and confirmed checkout showed the group dish; the group page returned the locked state.

## 2026-10-27 (continued): live events

Delivered:
- **Ticketed experiences** (BiteBox Live) at partner restaurants: chef's tables, tastings and comedy nights with venue, start/end time, capacity, seats left and per-ticket price.
- Customers book up to 6 seats from BiteBox Credits; the booking is confirmed atomically with seat inventory, a door entry code and a ticket pass. Low balances show the exact shortfall with an add-credits link.
- Free cancellation until 2 hours before the event returns the full amount to credits once, releases the seats, and marks the pass cancelled; the cancellation route is idempotent.
- `/events` and `/events/[eventId]` pages with seeded demo experiences, wallet state, “your tickets” history, and a Live events link in the header/account menu.
- Event revenue is ledger-posted to platform revenue, while refunds post to platform refund expense.

Verification:
- `pnpm typecheck` passes for all 8 workspaces.
- `pnpm test`: **175 tests in 13 files pass**, including 44 parity tests.
- Browser smoke: `/events` and `/events/:id` rendered live events, seat counts, ticket pricing and the credits shortfall state.

## 2026-10-27 (continued): Zomato parity completion (ads depth, localization, kit renewals, platform config)

Delivered:
- **Ads depth and merchant performance analytics**:
  - Outlets can configure maximum daily budgets (`max_daily_budget_paise`) and CPC click bids (`bid_per_click_paise`) via `PATCH /api/v1/merchant/restaurants/[restaurantId]/sponsorship`.
  - Sponsorship event ingestion endpoint `POST /api/v1/sponsorship/events` tracks impressions, clicks, and conversions.
  - Analytics API `GET /api/v1/merchant/restaurants/[restaurantId]/sponsorship/analytics` computes 30-day impressions, clicks, click-through rate (CTR), attributed orders, food revenue, and ROAS.
  - Merchant Growth tab surfaces live 30-day performance metric cards alongside campaign bidding controls; customer RestaurantCards automatically log sponsored impressions and clicks.
- **Multi-language depth**:
  - Comprehensive Hindi & English string dictionaries in `features/i18n/messages.ts` for transactional workflows.
  - Localized customer checkout (delivery instructions, cutlery preferences, tip amounts, payment method tags).
  - Localized live tracking page (OTP verification instructions, milestone progress indicators, split bill CTAs, safety sharing).
  - Localized support issue reporting, split-bill participant flows, and group order cards.
- **Rider equipment renewals & replacement fees**:
  - Rider equipment table tracks `renewal_due_at`, `replacement_fee_paise`, and `replacement_fee_deducted`.
  - Admin Insurance panel enables marking lost items with automated replacement fee debit from rider wallet earnings (`RIDER_EQUIPMENT_FEE` ledger transaction) or marking items renewed with a 180-day cycle extension.
  - Rider Rewards panel displays renewal status (`VALID`, `DUE_SOON`, `OVERDUE`), renewal due dates, self-service renewal request action (`POST /api/v1/rider/equipment`), and replacement fee notices.
- **Editable platform config & custom delivery zone polygons**:
  - Key-value configuration store `platform_config` with typed repository methods for reading and updating platform fees, surge multipliers, free delivery thresholds, maintenance mode, and announcements.
  - Admin Ops panel provides dynamic configuration controls via `GET`/`PUT /api/v1/admin/config`, immediately reflected in runtime `/api/v1/config`.
  - Delivery zones now accept custom multi-vertex boundary polygons `[{ latitude, longitude }]` alongside circular radius definitions in `POST /api/v1/admin/zones`.

Verification:
- `pnpm typecheck` passes for all 8 workspaces (0 errors).
- `pnpm test`: **180 tests in 13 files pass**, including 49 parity tests (4 new end-to-end suites).
- Next.js production build (`next build`) passes.
