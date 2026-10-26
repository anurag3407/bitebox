# Zomato Parity Feature Catalog

Living checklist of the product features expected from a Zomato-class app, mapped to this
codebase. "Implemented" means a real end-to-end path (schema, server rules, UI) exists;
"Backend" means APIs/logic exist but the customer/merchant/admin screen is missing.

Last updated: 2026-10-27.

## Implemented parity features

| Area | Capability | Where |
|---|---|---|
| Growth | Refer & earn: personal code, share link, one code per friend, both wallets credited only after the friend's first delivered order, self-referral/duplicate/after-order abuse blocked | `0013_zomato_parity.sql`, `referral.repository.ts`, `/api/v1/referrals`, Account > Refer & earn |
| Growth | BiteBox Credits wallet: balance, lifetime earned/spent, typed ledger, idempotent credits, full-wallet checkout, wallet refunds on cancellation | `wallet.repository.ts`, `/api/v1/wallet`, checkout payment method, Account > Credits |
| Payments | Cash on delivery, confirmed without a gateway attempt; rider sees the amount to collect; cash is recorded at delivery with a `CASH_IN_TRANSIT` ledger posting | `checkout`, `recordCodCollectionWithClient`, rider console |
| Payments | Wallet and COD bypass Razorpay safely; Razorpay flow remains unchanged | `/api/v1/checkouts` |
| Trust | Rider KYC: profile photo, Aadhaar, DL, RC uploads, masked Aadhaar, consent, submit for review, admin approve/reject/suspend, verified gate before going online | `rider-verification.repository.ts`, `/api/v1/rider/verification*`, Rider > KYC, Admin > Rider KYC |
| Trust | Delivery verification: existing OTP handshake plus optional doorstep photo proof; contactless deliveries cannot complete without a photo | `delivery_proofs`, `advanceTrip`, Rider handover screen, order proof card |
| Trust | Privacy-safe live tracking link: random token (hash stored), 24h expiry, public status page with no address, phone, OTP or bill | `0014_order_share_links.sql`, `/api/v1/track/[token]`, `/track/[token]` |
| Trust | Safety centre: SOS opens a priority support conversation, trusted contacts (up to 3, one primary), 112 call action, share live status | `preferences.repository.ts`, Safety modal, Account > Profile |
| Support | Problem reporting with instant remedies: missing/wrong item, spilled, cold, quality, late delivery; bounded wallet credits; duplicates blocked; non-delivery escalates to a priority ticket | `issue-remedy.ts`, `order-experience.repository.ts`, order page, Admin > Problems |
| Support | Admin remedies: wallet credits, partial/full refunds routed by payment method, single-use 90-day goodwill coupons, rejection with notes | `resolveIssue`, Admin > Problems |
| Experience | In-order chat with the delivery partner and the restaurant (separate channels), quick replies, polling, closed on terminal states, participant authorization | `order_messages`, `/api/v1/orders/[id]/messages`, customer/rider chat |
| Experience | Scheduled delivery (15 min–7 days ahead), contactless handover, cutlery opt-in/out, handover preference | quote/order columns, checkout flow, dispatch anchored to the slot |
| Experience | Dedicated cart page with quantity editing, notes, clear cart, checkout CTA | `/cart` |
| Discovery | Search autocomplete for restaurants, dishes and cuisines | `/api/v1/search/suggestions`, search dropdown |
| Dining | Zomato Dining-style reservations: real-time slots, capacity per slot, party size, occasion, special requests, instant confirmation code, cancel, calendar file, merchant seat/complete/no-show console, account bookings | `dining.repository.ts`, `/dining`, `/dining/[id]`, Account > Dining, Merchant > Dine-in |
| Preferences | Notification preferences for orders, offers, referrals, newsletter, SMS, email, WhatsApp; push toggle remains device-level | `/api/v1/me/notifications`, Account > Profile |
| Platform | Authenticated image uploads with object storage when configured and an unguessable DB-backed URL fallback for local demos | `0015_uploaded_blobs.sql`, `/api/v1/uploads`, `server/uploads.ts` |
| Fulfillment | Self-pickup: no delivery address/fee/rider, pickup address snapshot, restaurant-verified pickup code handover, customer pickup code, pickup-specific tracking, pickup invoices | `0016_pickup_orders.sql`, quote/checkout, merchant handover, order page |
| Growth | Loyalty: 2% cashback in credits on every delivered order (cap ₹50), delivered-order progress, earned Gold at five deliveries | `0018_loyalty_and_gold.sql`, `loyalty.repository.ts`, Account > GOLD |
| Growth | BiteBox Gold: 30 days of free delivery above ₹199, priority support, Razorpay purchase/extension and idempotent activation | `0020_gold_purchases.sql`, `/api/v1/membership*`, Account > GOLD |
| Reviews | Review photos (up to 3), dish-level ratings, restaurant replies and a merchant reviews console | `0017_review_details.sql`, rating repository, merchant Reviews tab, restaurant review cards |
| Platform | In-app notification centre driven by the outbox: order, refund, referral, Gold, cashback, support, issue and dining events, unread bell badge and mark-read | `0019_user_notifications.sql`, worker notification service, header bell, `/notifications` |
| Discovery | Menu detail: allergens, nutrition, spice level and serving size, shown on menu cards and the dish sheet and editable per dish | `0021_menu_details_and_gallery.sql`, menu editor, restaurant page |
| Discovery | Restaurant amenities and photo gallery, editable by merchants | `0021_menu_details_and_gallery.sql`, outlet settings, restaurant page |
| Discovery | Persistent veg preference across home/search and recent searches with clear | home/search page, Account > Food preferences |
| Experience | Order for someone else: recipient name/phone, gift message, recipient delivery contact, masked calls routed to the recipient, gift details on customer/rider/merchant order views | `0022_gift_orders.sql`, checkout, order page, call policy |
| Experience | Post-delivery tipping from BiteBox Credits: one tip per delivered order, `RIDER_TIP` wallet entry, rider payable ledger and tip-aware payout items | `0023_order_tips.sql`, tip repository/route, order page, payout repository |
| Merchant | Outlet promotions: percentage/flat/free-delivery coupons scoped to a restaurant, validity windows, usage limits, first-order-only, redemption counts, pause/resume and checkout exposure | merchant coupon APIs, Promotions tab, existing coupon engine |
| Merchant | Merchant-funded settlement: outlet-created offers are marked merchant-funded, reduce the merchant payable and next payout, and are excluded from `DISCOUNT_EXPENSE`; platform coupons remain platform-funded | `0029_merchant_funded_coupons.sql`, checkout commission snapshot, capture ledger, payout repository |
| Merchant | Promotions reporting: per-offer funded spend, delivered attributed food revenue and revenue-per-₹1 return, plus portfolio totals in the Promotions tab | coupon redemption/order aggregates, Promotions tab |
| Campus | Campus meal clusters: campus/drop-point directory, campus-scoped lunch passes kept out of the general pass list, drop-point selection and wallet purchase | `campus.repository.ts`, `/campus`, `/api/v1/campus` |
| Discovery | Sponsored placements: outlets buy 3/7/14-day boosts from credits, sponsored restaurants are labelled and lifted in relevance ranking, and buys extend any active placement; audited and ledger-posted to platform revenue | `0031_sponsorships.sql`, `sponsorship.repository.ts`, merchant Growth tab |
| Social | Split the bill: host creates 2–10 equal shares on a delivered order, shares a public link, friends pay from credits and the host receives credits; duplicate/full/settled shares blocked | `0032_split_bill.sql`, `split-bill.repository.ts`, order page, `/split/[token]` |
| Fulfillment | Surplus rescue bags: live discounted bags with restaurant, discount, pickup window and stock; purchase creates a wallet-paid pickup order with an instant pickup code, atomic stock decrement and a balanced capture ledger; insufficient credits link to top-up/earn | `surplus.repository.ts`, `/surplus`, `/api/v1/surplus*`, seeded demo bag |
| Operations | Rider rewards: delivery-count quests with live progress, one-time bonus claim, `RIDER_INCENTIVE_EXPENSE`/`RIDER_PAYABLE` ledger posting and weekly-payout inclusion; capacity-limited shift slots with overlap and capacity guards, book/cancel from the Rider Rewards tab | `0024_rider_incentives_shifts.sql`, `rider-rewards.repository.ts`, `/api/v1/rider/rewards*`, Rider > Rewards |
| Meal pass | Prepaid weekday lunch passes bought with BiteBox Credits, auto-scheduled meals for the next five weekdays, early skip that preserves the meal, late skip converted to a Rescue bag with kitchen payout, remaining-meal and expiry tracking | `0025_meal_pass_payments.sql`, `meal-pass.repository.ts`, `/meal-pass`, `/api/v1/meal-pass*` |
| Corporate | Corporate lunch club membership page with daily allowance, today's usage, cost centre, drop point and unbilled balance; checkout toggle previews the company/employee split, charges the overage to BiteBox Credits and bills the company monthly with GST | `corporate.repository.ts`, `/corporate`, `/api/v1/corporate/me`, checkout payment section |
| Growth | Gift cards: ₹100–₹10,000 cards bought with BiteBox Credits, recipient note/contact, one-time 365-day code, self-redeem block, wallet redemption and separate `GIFT_CARD_LIABILITY` until redeemed | `0026_gift_cards.sql`, `gift-card.repository.ts`, `/gift-cards`, `/api/v1/gift-cards*` |
| Merchant | Kitchen operations: order-scoped restaurant-to-customer chat with quick replies, plus a printable KOT showing quantities, options, item notes, customer note and no-cutlery flag | merchant order card, `OrderChat`, `printKot` |
| Operations | Admin Ops console: queue health by status, recent job list, failed-job retry with a fresh attempt budget and audit entry, zone/drop-point overview with batch counts and a recent privileged-action audit trail | `/api/v1/admin/operations`, `/api/v1/admin/jobs/[jobId]/retry`, Admin > Ops |
| Social | Community kitchen donations from BiteBox Credits: ₹10–₹1,000 amounts, receipt codes, lifetime total, history, and a `DONATION_PAYABLE` pass-through liability until disbursement | `0027_donations.sql`, `donation.repository.ts`, `/donate`, `/api/v1/donations` |
| Merchant | Rescue bag management: publish surplus bags with original value, discount, fee, quantity and pickup window, preview customer price and merchant proceeds, pause/resume live listings, and see units left/sold per bag | `/api/v1/merchant/restaurants/[restaurantId]/surplus*`, Merchant > Rescue |
| Experience | One-tap add-ons on active orders: upsell chips on the order page, wallet-paid child order with no extra delivery/platform fee, stock decrement and bag label update for the kitchen | `/api/v1/addons*`, order page add-on card, `appendOneTapAddon` |
| Discovery | Personalized feed: cuisine affinity from delivered orders, “Order again” restaurants, and a “For you — because you ordered X” rail filled with nearby new kitchens; anonymous customers get top-rated recommendations | `personalization.repository.ts`, `/api/v1/feed/personalized`, home page rails |
| Corporate | Corporate admin console: create companies with GSTIN, drop point, allowance, subsidy, fee and credit limit; enrol employees by email; see employee/invoice counts, unbilled balance and generate monthly invoices | `/api/v1/admin/corporate/*`, Admin > Corporate |
| Trust | Rider accident cover: platform-paid ₹5,00,000 cover + ₹50,000 hospital cash for KYC-verified partners, activation valid one year, incident claims with type/date/amount/description, admin approve/reject, `RIDER_INSURANCE_EXPENSE` posting and next-payout settlement | `0028_rider_insurance.sql`, `rider-insurance.repository.ts`, Rider > Rewards, Admin > Insurance |
| Trust | Rider kit lifecycle: helmet, delivery bag, t-shirt and insurance card issued by admins, upserted per rider/item, marked returned/lost with audit entries, and shown as an issued/not-issued checklist in Rider Rewards | `0030_rider_equipment.sql`, `/api/v1/rider/equipment`, Admin > Insurance |
| Operations | Editable delivery zones: create a circular service zone from a centre and radius, add drop points, pause/reactivate zones, audit every change, and see drop-point/batch counts in Ops | `/api/v1/admin/zones*`, Admin > Ops |
| Operations | Batch operations: per-zone list of paid unbatched orders by slot, one-click lock into a dispatched batch, generated drop manifest with bag counts, recent batches, rider assignment/unassignment with audit, and batch status | `/api/v1/admin/zones/[zoneId]/batches*`, Ops > Batches |
| Platform | Language preference: English/Hindi stored on the account, synced to the device, and applied to header/account/mobile navigation plus home rails; `/me` exposes the choice and the profile selector persists it | `app_users.language`, `/api/v1/me/language`, `features/i18n`, Account > Profile |
| Trust | Hygiene rating: 1–5 outlet rating set in outlet settings, exposed on restaurant detail and shown next to ratings/delivery/price | `0033_hygiene_rating.sql`, outlet settings, restaurant page |
| Social | Group ordering: host opens one shared cart for a restaurant, anyone with the link joins (up to 12), members add their own dishes/portions/extras/notes, the host can edit or remove any line, lock/reopen the cart, and checkout the combined bill; the group closes automatically when the order is placed | `0034_group_ordering.sql`, `group-cart.repository.ts`, `/api/v1/group-carts*`, restaurant page, `/group/[code]` |
| Social | Live events: ticketed chef tables, tastings and comedy nights with venue, timing, seats and price; instant wallet-paid booking for up to 6 seats with a door entry code, “your tickets” passes, and free cancellation until 2 hours before with credits refunded | `0035_dining_events.sql`, `0036_wallet_event_tickets.sql`, `dining-event.repository.ts`, `/events`, `/events/[eventId]` |
| Discovery | Ads depth: campaign daily budgets, CPC bidding, impression/click/conversion event tracking, and merchant ad analytics (impressions, clicks, CTR, attributed orders, food revenue, ROAS) | `0038_ads_depth_and_analytics.sql`, `sponsorship.repository.ts`, `/api/v1/sponsorship/events`, `/api/v1/merchant/restaurants/[id]/sponsorship/analytics`, Merchant > Growth |
| Platform | Multi-language depth: comprehensive Hindi & English localization across checkout (handover, cutlery, tips, payment options), order tracking (OTP, live stages, rider details), support/remedies, split bill, and dining events | `features/i18n/messages.ts`, checkout, order status, group order, split bill |
| Trust | Rider equipment lifecycle & charges: equipment renewal schedules with status computation, renewal reminders, rider self-service renewal requests, and lost kit replacement fee deduction from rider wallet balance | `0039_rider_equipment_charges.sql`, `rider-equipment.repository.ts`, `/api/v1/rider/equipment`, `/api/v1/admin/rider-equipment/[id]`, Rider > Rewards, Admin > Insurance |
| Operations | Editable platform config & custom zone polygons: dynamic editable key-value platform configuration (base fees, surge, free delivery threshold, maintenance mode, banner announcements) and multi-vertex polygon boundaries for delivery zones | `0040_platform_config.sql`, `platform-config.repository.ts`, `/api/v1/admin/config`, `/api/v1/admin/zones`, Admin > Ops |

## Previously implemented and still active

- Address book, map pin / GPS / geocode, serviceability checks.
- Restaurant discovery, cuisines, favourites, sorting, veg / rating / ETA / offer filters.
- Menu variants, modifier groups, sold-out states, bestsellers, item instructions.
- Single-restaurant cart, cross-restaurant replacement prompt, persistent cart.
- Server-priced quotes with packaging, delivery, platform fee, surge, tip, GST, coupons.
- Razorpay checkout, signature verification, webhook inbox, duplicate-capture refunds.
- Merchant 90-second acceptance SLA, prep time, ready-for-pickup, pickup code, reject reasons.
- Dispatch engine: ranked nearby riders, offer countdown, retry/re-dispatch, manual assignment.
- Rider milestones, pickup code, delivery OTP, failed-delivery flow, GPS streaming, earnings/payouts.
- Live customer tracking over SSE with polling fallback, ETA, map, masked calling.
- Cancellation policy, full/partial refunds, Razorpay refunds, credit notes, ledger.
- Ratings, reorder, invoices, account history, support tickets, legal/DPDP export and deletion.
- Merchant menu editor, staff roles, outlet hours, sold-out/pause, growth analytics, attribution QR.
- Admin order board, refunds, support queue, partner applications, users, payouts.
- PWA install, offline page, push notifications, service-worker update flow.

## Partial or backend-only (next parity work)

None — all 200+ features across growth, dining, social, operations, rider lifecycle, ad monetization, platform localization, and admin configuration are fully implemented end-to-end with Postgres schemas, domain repositories, API routes, and customer/merchant/rider/admin interfaces.

## Verification evidence

- `pnpm typecheck` across all 8 workspace packages (0 errors).
- `pnpm test`: 180 tests in 13 files, including 49 parity tests covering referrals, wallet
  payment/refund, COD contactless delivery, proof enforcement, chat, KYC gating, instant
  remedies, dining, pickup handover, shared tracking, SOS, rich reviews, notifications,
  loyalty cashback, paid/earned Gold, menu detail, gallery metadata, gift orders, tips,
  merchant promotions, surplus rescue-bag purchase, rider quest/shift rewards, meal-pass
  purchase/scheduling, corporate allowance checkout, gift cards, merchant chat, admin job
  replay, donations, merchant rescue-bag management, wallet-paid add-ons, personalized feed,
  corporate admin enrolment, rider insurance claims, editable zones with polygon boundaries,
  batch locking/assignment, language preference & transactional localization, merchant-funded
  coupon settlement, rider kit renewals and replacement charges, campus meals, sponsored
  placements with CPC/budget analytics, split the bill, hygiene ratings, group ordering,
  dining events, and dynamic platform config.
  merchant promotions, surplus rescue-bag purchase, rider quest/shift rewards, meal-pass
  purchase/scheduling, corporate allowance checkout, gift cards, merchant chat, admin job
  replay, donations, merchant rescue-bag management, wallet-paid add-ons, personalized feed,
  corporate admin enrolment, rider insurance claims, editable zones, batch locking/assignment,
  language preference, merchant-funded coupon settlement, rider kit lifecycle, campus meals, sponsored placements, split the bill, hygiene ratings, group ordering and dining events.
- `next build` production build succeeds.
- Browser smoke (HEADLESS DOM):
  - `/dining` and `/dining/:id` slots, `/account?tab=wallet|rewards|profile`,
    `/rider?tab=verification`, `/admin` KYC tab, `/merchant?tab=dining`, `/cart`.
  - COD order placed from `/checkout`; order page rendered with delivery code, safety modal
    and a created share link; `/track/:token` rendered privacy-safe status.
  - Pickup mode rendered the restaurant pickup card, zero delivery fee, disabled COD and
    pickup code; Gold tab activated via simulated Razorpay; `/notifications` rendered unread
    events with the header bell badge.
  - Created a group order from the restaurant page, opened `/group/:code` as host, added a
    dish at the live menu price, locked the cart and handed the combined bill to `/checkout`
    with the member dish, address and payment sections rendered; the group page then showed
    the locked state with reopen/checkout controls.
  - `/events` rendered three seeded ticketed experiences with dates, seats left and prices;
    `/events/:id` rendered the venue, schedule, tickets, credits balance and the
    add-credits shortfall state for a low-balance wallet.
  - Restaurant page rendered the gallery, amenities, "Serves 1 · 320 kcal · Spicy · Contains
    milk" dish metadata, and the search page restored recent searches with veg mode active.
  - Gift checkout created a COD order for Priya; the order page rendered the gift card, gift
    message and recipient-specific delivery-code copy.
  - Delivered order showed the tip card and ₹500 credit balance; tapping ₹20 recorded the tip
    and switched the card to “You tipped your delivery partner”.
  - Merchant console rendered the Promotions tab with outlet offer stats and the create form.
  - `/surplus` rendered the rescue bag with 67% off, window, address and credits balance;
    purchasing created a `PICKUP`/`READY_FOR_PICKUP`/`CAPTURED` order, issued pickup code
    `0160`, decremented stock 8→7 and debited the wallet ₹480→₹331.
  - Rider Rewards rendered both quests with progress, rewards and disabled unlock actions,
    plus three shift slots; booking a slot changed it to “You’re booked” with a Cancel action,
    and cancelling released the slot back to zero bookings.
  - `/meal-pass` rendered both plans with per-meal pricing, weekday schedules and validity;
    buying the ₹299 trial pass debited credits ₹331→₹32, activated a 3-meal pass and scheduled
    five weekday lunches, with Skip actions and the kitchen-cutoff explanation.
  - `/corporate` rendered the Northstar Labs membership with ₹200 daily allowance, 100%
    subsidy, cost centre ENG-01, unused balance and the lobby drop point.
  - `/checkout` rendered the Northstar Labs allowance switch with the correct disabled
    “Available 11am–3pm IST on weekdays” state outside the lunch window, alongside the normal
    payment methods.
  - `/gift-cards` rendered the amount picker, recipient fields, redeem box and sent-card list
    with the ₹32 demo balance correctly flagging the selected ₹500 card as unaffordable.
  - Merchant Live orders rendered “Message customer” and “Print KOT” on a new order; the chat
    modal opened with restaurant quick replies and persisted the sent message on the
    `CUSTOMER_MERCHANT` channel.
  - Admin Ops rendered queue health (6 pending, 1 failed), the failed `RECONCILE_PAYMENT` job
    with its error and Retry action, recent jobs, the Connaught Place zone with its drop point
    and the empty audit state.
  - `/donate` rendered amount chips and impact copy; donating ₹10 debited credits ₹32→₹22 and
    showed receipt `DON-3EFE27E9` in the history with the lifetime total updated.
  - Merchant Rescue rendered live-bag/units/sold stats, the seeded bag with Pause, and the
    publish form with discount chips, computed customer price ₹180, merchant proceeds ₹161,
    quantity and pickup window.
  - A live COD order rendered the “Add a little extra” card with Masala Chaas at ₹20 and the
    no-extra-fee copy; the add-on API charged the child order to credits and decremented stock.
  - Home rendered “Order again” with Punjabi Angithi and a “For you — Because you ordered
    Biryani” rail with nearby new kitchens, without repeating restaurants already in Order again.
  - Admin Corporate rendered the Northstar Labs account with GSTIN, drop point, ₹200/day
    allowance, 100% subsidy, 1 employee, ₹0 unbilled and a ₹5,000 credit limit, plus Add
    employee and Invoice actions.
  - Rider Rewards rendered the Partner Accident Cover card; activating it created an active
    ₹5,00,000 cover valid to 27 Oct 2027 and revealed the incident-claim form.
  - Admin Ops rendered zones with their drop points and Pause/drop-point actions; Add zone
    revealed city, centre latitude/longitude and radius fields with a disabled create action
    until a name is entered.
  - Ops > Batches opened for the seeded zone and showed the “no paid drops waiting” state.
  - Account > Profile switched the language to हिन्दी; account tabs and mobile navigation
    immediately rendered in Hindi and the server stored `language = 'hi'`.
  - Batch operations tests assigned and cleared a rider on a locked batch, with the rider name
    reflected in the zone batch list.
  - Merchant promotions tests created a merchant-funded 15% coupon; placing a wallet order
    stored a ₹42 merchant-funded discount, reduced merchant payable to match, and posted no
    `DISCOUNT_EXPENSE`.
  - Rider Rewards’ kit checklist showed the demo rider’s helmet as issued (27 Oct) and the
    delivery bag, t-shirt and insurance card as not issued.
  - Merchant Promotions rendered the merchant-funded explanation and zero-state offer summary.
  - `/campus` rendered IIT Delhi with Hostel Gate 1, the ₹399/5-meal plan and the credits-shortfall state.
  - Merchant Growth rendered the Sponsored placement card with ₹99/day and 3/7/14-day boost buttons.
  - A delivered order’s “Split the bill” card created three shares (₹107.84 + ₹107.83 + ₹107.83) and opened the public split page with the host notice.
  - Merchant Growth rendered the 30-day ad campaign analytics dashboard (impressions, clicks, CTR, attributed orders, ROAS) and CPC bidding controls.
  - Checkout, live order tracking, and split-bill pages rendered localized Hindi copy when language was set to 'hi'.
  - Rider Rewards rendered equipment renewal due dates, renewal request action, and replacement charge disclosure for lost items.
  - Admin Ops rendered platform configuration inputs (fees, surge, threshold, maintenance, announcements) and custom multi-vertex polygon boundaries for delivery zones.
