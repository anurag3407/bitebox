# From a 33% Tax to a Fair Food-Delivery Business

**Business-model analysis and revenue strategy for this platform**

Prepared 24 October 2026.

**Scope:** an audit of what this repository actually implements; a teardown of 13 food-delivery and restaurant-commerce models; nine revenue-model options; a recommended sequence; and a 90-day validation plan.

**Read this first:** Every unit-economics number below is illustrative and must be replaced with pilot data. Market figures are sourced at the end. Rates and regulations change; verify GST, FSSAI and RBI treatment with a CA/lawyer before launch.

---

## 0. Executive summary

### The diagnosis

The 33% figure is real, but it is not a pure commission and it is not pure profit:

- Zomato's reported **take rate** rose to **32.84%** in Q1 FY27 (the June 2026 quarter, up 321 bps). The same results put contribution margin at **10.2%** — the 33% is a gross take rate, not profit. According to NRAI, Zomato has communicated a total service-fee cap of around 30% including long-distance charges; restaurant bodies dispute how it is applied.
- DoorDash's **gross commission** is 15–30%, but its **net revenue margin** was **13.5% of marketplace GOV** in Q4 2025. The gap goes to riders, discounts, refunds and support.
- Meituan charges a **6–8% "technology service fee"** in China and earns more from delivery fees and advertising.
- India does roughly **2 billion food-delivery orders a year** at an average order value of about **₹390**.

So the restaurant pays 30%+, while the platform's contribution margin is much thinner. The restaurant experiences the gross tax; the platform lives on the net. That asymmetry is the opening.

### The thesis

**Price the service, not the food.**

A 33% commission is really four products bundled into one percentage: demand generation, delivery, software/settlement/compliance, and trust/support. A percentage of food value is a poor price for all four:

- A ₹200 order and a ₹800 order cost roughly the same to deliver, but the commission is 4x higher on the larger order.
- A restaurant's loyal customer, ordering through the platform, still pays the demand-generation fee even though the platform did not generate that demand.
- A restaurant that only needs software, payouts and GST invoices is forced to buy logistics and ads too.

Unbundle the bundle. Charge only for the part you actually provide.

### The three models I recommend

1. **Open Pricing (channel-based, capped-and-floored commission)** — the public pricing model.
   - **0% commission** when the restaurant brings the customer through its own tracked link/QR.
   - **12% commission when the platform brings the customer**, with a **₹19 floor** and a **₹49 cap** per order.
   - Customer pays a transparent delivery fee at cost plus a small platform fee; restaurant can buy a ₹1,999/month software plan.
   - This is the marketing wedge: "We only charge for demand we create, and never more than ₹49 on an order."

2. **Meal Pass (prepaid, scheduled, batch-delivered meals)** — the profit and density engine.
   - ₹129 per meal; kitchen keeps ₹78 (60.5%); batched delivery costs about ₹12; contribution about **₹26.4 per meal (20.5%)**.
   - Sell monthly passes to one dense campus or office park; pre-order by 10am; deliver 12:30–1:30 in batches of 8–10 meals per trip.
   - One cluster at 250 meals/day contributes about **₹1.7 lakh/month**; 20 clusters at 5,000 meals/day contributes about **₹34 lakh/month**.
   - This is the only model where you control demand, density and price at the same time.

3. **Kitchen OS / Delivery-as-a-Service (DaaS)** — the B2B lock-in.
   - ₹1,999/month + ₹15/order, **0% commission**, delivery at cost, for restaurants' own website/WhatsApp/QR orders.
   - Sell the rails you already have: menu, checkout, payments, dispatch, refunds, GST invoices, payouts, analytics.
   - At 200 merchants doing 300 orders/month each: about **₹13 lakh/month** of high-margin software/fee revenue.

### The sequence

**Meal Pass for density → Open Pricing for the marketplace → Kitchen OS for merchant lock-in → surplus, office lunch clubs and embedded finance later.**

This order matters. Meal Pass creates dense demand and merchant trust; Open Pricing then gives those merchants a reason to stay on the marketplace; Kitchen OS monetizes the relationship even when the customer orders direct. The reverse order (marketplace first) means paying CAC to fight Zomato on selection, which is the most expensive way to enter this market.

### Illustrative scale

At 5,000 meals/day, 500 marketplace orders/day and 150 Kitchen OS merchants, the model produces roughly:

- **₹1.85 crore/month of gross platform revenue** (pass sales, marketplace fees and software; before kitchen and rider payouts)
- **₹47 lakh/month contribution**
- **₹27 lakh/month EBITDA** before tax, at about ₹20 lakh/month fixed cost

Those are pilot-dependent assumptions, not a forecast. The point is the shape: the meal pass carries the volume, the marketplace adds commission revenue, and the software layer adds margin without delivery risk.

### What not to do

- Do not launch a horizontal 33%-commission Zomato clone in Delhi-NCR. You will lose on customer acquisition and supply, and you will be competing on the one dimension where incumbents are strongest.
- Do not offer 0% commission with solo on-demand delivery. Delivery is the cost; without density or merchant-owned demand, you lose money on every order.
- Do not build ads, wallets, lending or a white-label business before you have density.
- The original working name, "ZomatoFresh", was confusingly similar to Zomato's trademark, so the product is now **BiteBox**. Run a trademark search on "BiteBox" (classes 35/39/43) before any launch or fundraising conversation.

---

## 1. What this app actually has

This is more than a prototype UI. The money rails and the operational core are largely built, which changes the strategy: you can test non-commission models without rebuilding settlement.

| Capability | Where it lives | Why it matters commercially |
|---|---|---|
| Per-restaurant commission in basis points (0–100%), default 15% | `packages/database/migrations/0002_production_hardening.sql:57`; `packages/core/src/modules/payouts/settlement.ts:3` | You can set 0%, 12% or any rate per merchant. The schema does not need a rewrite to test Open Pricing. |
| Separately priced delivery, packaging, platform fee, surge, tip and GST | `packages/core/src/modules/pricing/pricing-calculator.ts:114` | The bill is already unbundled. You can price each service independently, which is the core of "price the service, not the food." |
| Double-entry ledger with merchant, rider, platform revenue, tax and refund accounts | `packages/core/src/modules/accounting/ledger-model.ts:58` | Any revenue split is auditable. This is the foundation for daily settlement, merchant statements and, later, advances. |
| Merchant and rider payouts, payout accounts, payout items | `packages/database/migrations/0003_partners_payouts_invoices_support.sql:51` | You can pay merchants and riders on a schedule. DaaS and embedded finance become incremental, not greenfield. |
| GST invoices and credit notes with per-financial-year sequences | `packages/database/migrations/0003_partners_payouts_invoices_support.sql:102` | Required for B2B/corporate sales and Kitchen OS. Most low-cost delivery tools do this badly. |
| Dispatch eligibility, distance, freshness and travel-time ranking | `packages/core/src/modules/dispatch/dispatch-engine.ts:30` | Good foundation for batching, but today it ranks candidates; it does not group orders into multi-drop trips. |
| Customer, merchant, rider and admin PWAs; refunds, ratings, support tickets, webhooks, outbox | `README.md`, `docs/implementation/progress.md` | Low-cost operations and a credible demo for merchants. |
| Partner onboarding, admin audit log, support inbox | `packages/database/migrations/0003_partners_payouts_invoices_support.sql:7` | Merchant success and compliance are partly built. |

### What is missing for the recommended models

| Gap | Why it blocks the model | Build size |
|---|---|---|
| Order-source attribution (platform, merchant link, pass, corporate) | Without it, you cannot charge different prices for platform-generated vs merchant-generated demand. | Small–medium |
| Commission floor and cap (only basis points exist today) | "12%, minimum ₹19, maximum ₹49" cannot be expressed in the current schema. | Small |
| Recurring meal plans, credits, skip/pause, scheduled order generation | The Meal Pass is a subscription, not a one-off checkout. | Medium |
| Batch dispatch (group orders by cluster and time window, assign one rider, sequence drops) | The unit economics of every low-commission model depend on drops per trip. | Medium |
| Merchant analytics (order-source mix, commission saved, payout statement) | This is the sales tool for Open Pricing and Kitchen OS. | Small |
| Merchant storefront/link/QR | Needed for "merchant-originated" orders and for DaaS. | Medium |
| Ads/ranking auction | Only matters after liquidity. Not now. | Large |

**The important conclusion:** you are roughly two to three sprints away from being able to test all three flagship models. The hard money plumbing — ledger, payouts, invoices, GST, refunds — is already there.

---

## 2. The 33% teardown

### 2.1 Take rate is not commission

The 33% is best understood as a **take rate**: all platform revenue (commission, ads, fees, subscriptions) divided by gross order value. The base commission may be 18–30%; ads, payment charges, GST and merchant-funded discounts push the restaurant's effective cost to 30–35%.

Zomato's reported take rate reached **32.84%** in Q1 FY27 (the June 2026 quarter, up 321 bps), while its contribution margin was **10.2%**. NRAI has said Zomato communicated a total service-fee cap of 30% including long-distance charges; restaurants allege the cap is breached in practice. The exact number matters less than the direction: the trend is up, and merchants are organized against it. The gap between the 33% take rate and the ~10% contribution margin is the cost of riders, discounts, refunds and support — and it is why the platform cannot simply cut the commission without changing its cost structure.

### 2.2 Where a ₹400 order goes (illustrative)

Assumptions: 30% commission, 18% GST on platform fees, 2% payment gateway, 5% ad spend, ₹20 merchant-funded discount, ₹10 packaging cost, restaurant under the 5% GST-without-ITC regime (so commission GST is a real cost).

| Line item | Zomato-like aggregator | Open Pricing (12%, ₹49 cap) |
|---|---:|---:|
| Menu price | ₹400 | ₹400 |
| Commission | ₹120 | ₹48 |
| Merchant order fee | ₹0 | ₹15 |
| GST on platform fees (18%) | ₹21.6 | ₹11.3 |
| Payment gateway (2%) | ₹8 | ₹8 |
| Merchant ad spend | ₹20 | ₹0 |
| Merchant-funded discount | ₹20 | ₹0 (optional) |
| Packaging cost to merchant | ₹10 | ₹10 |
| **Restaurant net** | **~₹200 (50%)** | **~₹308 (77%)** |
| Customer pays (incl. fees/taxes) | ~₹433 (after a ₹30 platform discount) | ~₹460 |
| Rider pay | ₹40 | ₹40 |
| Platform contribution before fixed costs/CAC | ~₹93 solo, ~₹108 at 4 drops/trip | ~₹44 solo, ~₹59 at 4 drops/trip |

The restaurant is about **₹108 better off per order** under Open Pricing. It can fund a ₹24 customer discount and still be ₹84 ahead. That is the entire sales pitch in one table.

The platform earns less per order on high-AOV food, but it also does not carry the discount burden or the ad-subsidy war. It earns more on frequency, software and delivery density. That is a different business, not a worse one.

### 2.3 Why the percentage model exists

- **Delivery is a fixed cost per drop.** A rider trip costs roughly ₹40–120 depending on distance and drops. A percentage commission is a convenient way to recover that cost without metering it.
- **Demand acquisition is expensive.** Platforms spend on discounts, push notifications, brand and ads. A percentage of GMV scales with the value they help create.
- **High-AOV orders subsidize low-AOV orders.** A 30% commission on ₹800 pays for a lot of ₹150 orders.
- **It is opaque.** Restaurants see a deduction, not a cost stack. That opacity is now a liability: NRAI, ONDC and direct-ordering vendors have made merchants aware of alternatives.

### 2.4 Why the model is vulnerable

- **Restaurant margins are thin.** Many independent restaurants run single-digit to low-double-digit EBITDA margins. A 30%+ effective cost is existential, not a line item.
- **Direct ordering is now credible.** DotPe/Thrive-style tools charge roughly 0–5% plus a subscription; restaurants keep the customer data.
- **ONDC has made low-commission food ordering a public policy idea**, with network fees commonly cited in the low single digits.
- **Aggregators are distracted by quick commerce.** Eternal's growth and investment are increasingly in quick commerce; food delivery is the mature cash engine. That makes a voluntary commission cut less likely.
- **The tools to build an alternative got cheaper.** PWA, UPI, WhatsApp, cloud dispatch and GST invoicing are commodities. The moat is no longer "we can build an app."

### 2.5 The four things a 33% fee buys — and how to price them separately

| What the fee buys | Can the merchant buy it elsewhere? | Better pricing |
|---|---|---|
| Demand generation | Only the platform, or the merchant's own marketing | Commission or ads, but **only when the platform actually creates the demand** |
| Delivery | Platform fleet, third-party logistics, own rider | Per-delivery fee at cost + a small margin; batch to lower cost |
| Software, settlement, GST, payouts | SaaS vendors, POS, direct-ordering tools | Flat monthly subscription |
| Trust, support, refunds, insurance | Platform or insurer | Per-order fee or insurance commission |

**The strategic move:** let the merchant buy the bundle they need. A restaurant with its own customers should not pay for demand. A restaurant with high-AOV orders should not pay a percentage that scales with food value. A restaurant that only needs software should be able to buy software.

---

## 3. How the world's food-delivery apps actually make money

The Indian market is effectively a duopoly — Zomato at roughly 55–58% share and Swiggy at 42–45% — so a new entrant should not attack the whole market head-on.

| Model | Primary revenue lines | Merchant cost | Who pays delivery | Lesson for you |
|---|---|---|---|---|
| **Zomato / Swiggy (India)** | 18–30% commission + ads + delivery/platform fees + membership | 25–35% effective | Customer + platform subsidy | Demand ownership + density justifies a high take rate, but merchant trust is the weak point. |
| **DoorDash / Uber Eats (US)** | 15/25/30% commission tiers + DashPass/Uber One + ads | 15–30% + ads | Customer + platform | Ads and membership are the margin. DoorDash's net revenue margin was 13.5% of GOV in Q4 2025; ads were about 12% of revenue and growing fast. |
| **Meituan (China)** | 6–8% "technology service fee" + delivery fees + ads | Low single digits to ~8% | Customer/merchant, platform fleet | Low commission can work when delivery is priced separately and density is enormous. Delivery is ~30% of revenue, commission ~28%, ads ~14%. |
| **ONDC (India)** | Low single-digit network fees; the buyer/seller apps monetize separately | Low | Varies | Merchants want low commission, but discovery and logistics still need a payer. A protocol does not solve demand. |
| **DotPe / Thrive / Rista (India direct ordering)** | Subscription + 0–5% + payment fees | 0–5% + subscription | Merchant or customer | Merchants will pay for ownership and data. Bundle delivery and settlement to differentiate. |
| **Restaurant OS (Toast, Olo)** | SaaS + payments + delivery integrations | SaaS + payment spread | Merchant/third party | Workflow lock-in is durable. Delivery is a feature, not the whole product. |
| **ChowNow (US flat-fee)** | Flat monthly subscription (~$229–$449), 0% commission + payment processing | Subscription | Merchant/own couriers | Flat fees work when the merchant owns demand. They do not fund consumer acquisition. |
| **Kitopi (kitchen-as-a-service)** | Reported ~10% royalty + kitchen/facility fees + services | Royalty + rent | Platform/brand | Monetize capacity and utilization, not just orders. |
| **Rebel Foods / cloud-kitchen brands** | Food margin on own brands + franchise/kitchen fees | Brand pays royalty/rent | Platform | Owning the brand yields higher margin but is capital- and ops-heavy. |
| **Tiffin / meal subscriptions (India)** | Prepaid weekly/monthly plans, often ₹69–150/meal | No aggregator commission | Own/route delivery | Recurring, scheduled demand is the cheapest demand. Quality and reliability are the moat. |
| **Too Good To Go (surplus)** | Fixed fee per surprise bag: ~$1.79 in the US; £1.09 + VAT or 25% in the UK above a threshold; retailer membership | Fixed fee per bag | Pickup-first | A fixed fee per transaction works for low-ticket, pickup-first inventory. |
| **Corporate cafeteria platforms (SmartQ-like)** | SaaS + per-meal fees + employer billing | SaaS/per meal | Employer/campus | The employer pays, so consumer CAC is near zero. Invoicing/GST is a real moat. |
| **Domino's (own delivery)** | Food margin + delivery fee | None (own channel) | Customer | Vertical integration gives control, but it is asset-heavy and brand-specific. |

### Five patterns

1. **Commission alone is rarely the profit pool.** The money is in ads, membership, delivery pricing, software or supply-chain margin. Zomato/Swiggy are commission-heavy because they own demand; Meituan is low-commission because it prices delivery and ads separately.
2. **Every low-commission model has a second payer.** The merchant pays SaaS, the customer pays delivery, the employer pays a subsidy, or the brand pays rent/royalty. Someone always pays for the rails.
3. **Fixed fees work where demand is scheduled, dense or merchant-owned.** They fail where the platform must buy demand.
4. **Owning demand is the only justification for percentage pricing.** If the merchant brought the customer, a percentage of food value is a tax, not a service fee.
5. **The most defensible businesses own a workflow or a habit.** Toast owns the restaurant's operating workflow; a meal pass owns the customer's lunch habit. A pure marketplace owns neither.

**Your app is closest to the infrastructure layer** — ledger, payouts, invoices, dispatch, multi-actor operations. That suggests selling the workflow and the logistics, not just demand. It also means you can serve merchants who never list on a marketplace.

---

## 4. Where the 33% hurts most

Not all segments are equal. The best segment has high aggregator pain, high density, high frequency and a payer who is not the consumer.

Scoring: 1 = low, 5 = high. "Score" is the simple sum of the six criteria (max 30).

| Segment | Pain of 33% | Density / batchability | Frequency | Willingness to pay | Ops complexity (5 = hard) | Competition (5 = intense) | Score |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Office parks / corporate campuses** | 5 | 5 | 4 | 4 | 3 | 3 | **24** |
| **College campuses** | 5 | 5 | 5 | 3 | 3 | 2 | **23** |
| **Tiffin / health-meal subscribers** | 5 | 4 | 5 | 4 | 3 | 3 | **24** |
| **Hospitals** | 4 | 4 | 5 | 3 | 4 | 2 | **22** |
| **Residential societies** | 4 | 3 | 4 | 4 | 3 | 4 | **22** |
| **Cloud kitchens** | 5 | 3 | 5 | 4 | 2 | 3 | **22** |
| **Tier-2/3 cities** | 4 | 3 | 3 | 3 | 4 | 2 | **19** |
| **Late-night / convenience** | 3 | 2 | 3 | 4 | 4 | 3 | **19** |
| **Surplus food** | 4 | 2 | 2 | 3 | 2 | 2 | **15** |

### Why office parks and campuses first

- **Geography:** 3,000–20,000 people inside 1–3 km². One drop point per building or floor; 8–10 meals per rider trip.
- **Time:** a single lunch peak. Pre-orders by 10am turn delivery into a scheduled route, not a dispatch scramble.
- **CAC:** student ambassadors, campus WhatsApp groups and HR channels are cheap. You do not need to outbid Zomato on Google ads.
- **Price:** a ₹129 all-in lunch is 30–40% cheaper than a comparable aggregator order after fees, and more varied than a canteen or tiffin.
- **Payer:** in offices, the employer can subsidize part of the meal; in campuses, parents often fund the monthly pass. Both reduce price sensitivity.
- **Competition:** canteens are cheap but limited; tiffins are monotonous; Zomato is expensive and slow at peak. The gap is variety + reliability + price, not "more restaurants."

### Why not a whole city

A city launch spreads demand across too many pin codes, makes batching impossible, and forces you to compete on restaurant selection. A cluster launch gives you density, a reference customer, and a repeatable playbook. Win one cluster end-to-end before adding the second.

---

## 5. Nine revenue models, with numbers

The first three are the recommended core. The other six are options to layer on after density, or hedges if the core does not work. Ads-only is included as a later layer, not a launch model.

### 5.1 Flagship 1 — Open Pricing: charge only for demand you create

**Mechanics**

| Order source | Commission | Merchant fee | Customer fee | Delivery |
|---|---:|---:|---:|---|
| Platform discovery/search/ads | 12%, floor ₹19, cap ₹49 | ₹15/order | ₹5/order | At cost + small margin |
| Merchant's own link/QR/WhatsApp | 0% | ₹15/order; Kitchen OS ₹1,999/month + ₹15/order | ₹5/order | At cost |
| Meal Pass / corporate | 0% | Fixed kitchen payout or flat fulfillment fee | Included in pass | Batched at cost |
| Merchant self-delivery | 0% | ₹0–₹15/order | ₹5/order | Merchant |

**Why the floor and cap**

- The **floor** protects you on small orders: 12% of ₹100 is only ₹12, below the cost of support and payment processing. A ₹19 minimum keeps small orders viable.
- The **cap** protects the merchant on large orders and is a powerful marketing claim: "Never more than ₹49, no matter the order value."
- The band makes your revenue predictable and visibly fair. It is easy to explain on a rate card, which matters in a market where restaurants distrust opaque deductions.

**Commission comparison**

| Food order | 30% commission | Open Pricing commission | Net saving after ₹15 fee |
|---:|---:|---:|---:|
| ₹200 | ₹60 | ₹24 | ₹21 |
| ₹400 | ₹120 | ₹48 | ₹57 |
| ₹800 | ₹240 | ₹49 | ₹176 |

Add the 18% GST and ad spend, and the gap widens further. This table is the entire merchant acquisition pitch.

**Attribution rules (critical)**

- A merchant-originated order must start from a signed merchant link/QR (`src=merchant`, merchant ID, timestamp, signature).
- Use last-touch attribution with a 30-day window. If the customer touched a platform surface (search, push, ad) in the last 30 days, the order is platform-originated.
- The merchant cannot retroactively mark orders as merchant-originated. The order source is written at checkout and immutable.
- Do not promise "0% forever" in a way that is gameable. Publish the rules; audit the top merchants monthly.

This is the same principle as affiliate attribution. It is fair, auditable and technically simple.

**Unit economics (₹400 order, platform-originated)**

| Line | ₹ |
|---|---:|
| Commission (12%, cap ₹49) | 48 |
| Merchant order fee | 15 |
| Customer platform fee | 5 |
| Delivery fee | 29 |
| Rider cost (solo / 4-drop) | (40) / (25) |
| Payment gateway + support | (13) |
| **Contribution** | **44 solo / 59 at 4 drops** |

At a 4-drop trip, the model contributes about 15% of food value before fixed costs and CAC. That is healthy for a marketplace, and the merchant is still paying far less than 30%.

**Risks**

- **Attribution gaming:** a merchant gives its QR to walk-in customers and claims 0%. Mitigate with last-touch rules and by charging a per-order fee even on merchant-originated orders. If the merchant genuinely brought the customer, you are still paid for delivery and software.
- **Low-AOV orders:** the floor helps, but a ₹99 order with a ₹29 delivery fee and a ₹40 rider cost still loses money. Set a minimum order value or a small-order fee.
- **Merchant expects 0% on everything:** be clear that 0% applies only to merchant-originated demand. Platform demand has a commission.
- **Zomato copies the cap:** possible. Your defense is density, merchant relationships and the pass habit, not the pricing table alone.

**What to build:** `orders.acquisition_channel`, `commission_min_paise`, `commission_max_paise`, signed merchant links/QR, immutable attribution at checkout, merchant statement showing "commission saved vs 30%."

---

### 5.2 Flagship 2 — Meal Pass: prepaid, scheduled, batched

**The product**

A monthly lunch pass for a campus or office park. The customer pre-orders by 10am, chooses a veg/non-veg option from a rotating menu, and receives lunch between 12:30 and 1:30 at a fixed drop point. Skip/pause up to 24 hours ahead. Refund or replace if late or missing.

**Pricing and unit economics**

| Per meal | ₹ |
|---|---:|
| Customer price | 129 |
| Kitchen payout (60.5%) | 78 |
| Packaging | 8 |
| Batched delivery (8–10 meals/trip) | 12 |
| Payment gateway (2%) | 2.6 |
| Support / refunds (2%) | 2 |
| **Platform contribution** | **26.4 (20.5%)** |

At 250 meals/day and 26 operating days: 6,500 meals/month, **₹1.72 lakh contribution per cluster**.

**Why the kitchen says yes**

- ₹78 per meal × 250 meals/day = ₹19,500/day of guaranteed, prepaid revenue.
- Food cost is roughly ₹35–40/meal for a simple thali, leaving ₹9,500–10,750/day before labor and rent — attractive if the kitchen has idle 11am–2pm capacity.
- No commission, no ad spend, no discount war, no customer acquisition cost. The kitchen does what it is good at: batch cooking.
- The platform handles demand, payments, routing, support and refunds.

**Why the customer says yes**

- ₹129 all-in versus roughly ₹180–220 for a comparable aggregator lunch after delivery, platform fee, packaging and GST.
- Predictable timing and a known menu, not a 45-minute ETA at peak.
- Skip/pause instead of losing money on a missed delivery.
- Variety: a rotating menu across 2–3 kitchens is better than a single canteen or tiffin.

**Why this is different from Zomato**

- Zomato sells choice on demand; the pass sells a **habit** on a schedule.
- Zomato's economics worsen at peak because delivery is unbatched; the pass's economics improve at peak because every order is known in advance and going to the same place.
- The pass does not need to win the "what do I want for dinner?" battle. It only needs to win lunch on weekdays.
- The customer relationship is a subscription, not a series of one-off transactions. Retention is structurally higher.

**Operations playbook (one cluster)**

- 3 partner kitchens within 3 km; each guarantees 30–80 meals/day; one backup kitchen.
- One menu cycle of 4 weeks; 2 veg + 1 non-veg option; published by 6pm the previous day.
- Cutoff 10am; kitchen production list generated at 10:05am; rider route generated at 11:30am.
- At 250 meals/day: 8–10 riders, 3–4 trips each in the two-hour lunch window; start with 3–4 riders for the first 100 meals/day. Insulated crates; sort by building/floor; drop at a single point per building.
- OTP or photo proof at drop; customer support via WhatsApp; refund policy published.
- Weekly merchant payout; monthly customer billing; pause/skip self-service.

The pass's delivery advantage is **drop density**: 8–10 meals go to 2–4 building drop points, not 8 separate addresses. That is why ₹12/meal is achievable at 250 meals/day, while an 8-address marketplace trip costs about ₹160 (₹20/order). Same rider, different route shape.

**Sensitivity**

| Variable | Base | Downside | Contribution/meal |
|---|---|---|---:|
| Meals per trip | 8–10 (₹12 delivery) | 4 (₹25 delivery) | ₹26.4 → ₹13.4 |
| Kitchen payout | ₹78 | ₹85 | ₹26.4 → ₹19.4 |
| Customer price | ₹129 | ₹109 | ₹26.4 → ₹6.4 |

The model is sensitive to batch size and price. **Do not launch at ₹99.** At ₹109, contribution is only ₹6.4/meal; one refund or one weak route wipes it out. Price for the service, not for penetration.

**Risks**

- **Food quality and consistency:** one bad week can kill a campus. Use a fixed menu, tasting approval, daily quality checks and a replacement policy.
- **Kitchen reliability:** a kitchen that misses the 10am cutoff creates a cascade. Keep a backup kitchen and a penalty/reward SLA.
- **Seasonality:** exams, holidays and semester breaks can halve demand. Office parks are more stable; mix both.
- **Prepaid float:** see the compliance section. Keep the money in a designated account, recognize revenue as meals are delivered, refund unused credits, and do not issue a general-purpose wallet.
- **Single decision-maker risk:** one campus admin or HR head can end the cluster. Always have two clusters and more than one buyer persona.

**What to build:** meal plans, subscriptions, credits, skip/pause, cutoff, scheduled order generation, batch dispatch, kitchen production list, drop-point routing, pass billing and refunds.

---

### 5.3 Flagship 3 — Kitchen OS: sell the rails, not the demand

**The product**

A branded ordering layer for a restaurant's own customers:

- Menu and storefront at `yourbrand.com/m/restaurant-name` or a QR code.
- WhatsApp ordering and payment links.
- Delivery by your fleet (at cost) or the merchant's own rider.
- Payments, refunds, GST invoices, credit notes, merchant payouts, support.
- Customer list and order analytics owned by the merchant.
- Optional listing on your marketplace for incremental demand.

**Pricing**

- ₹1,999/month for a single outlet or ₹3,999/month for multi-outlet; both include the storefront, menu, analytics and support.
- ₹15/order platform fee.
- Delivery at cost: ₹35–40 within 3 km, or merchant self-delivery.
- 0% commission. No lock-in; data export on exit.

**The sales calculator**

A restaurant doing ₹5 lakh/month of delivery GMV on an aggregator at 30% effective cost pays about ₹1.5 lakh/month. On Kitchen OS, with 1,000 orders:

- Subscription: ₹1,999
- Platform fees: 1,000 × ₹15 = ₹15,000
- Delivery: passed through at cost
- Payment gateway: ~2% of food value, same as before
- **Total platform cost: ~₹17,000 + delivery pass-through**

Even if only 30% of the restaurant's orders migrate, the saving is roughly ₹37,000/month. The pitch writes itself.

**Why you can win**

- Most direct-ordering tools are websites plus a payment link. You have dispatch, refunds, ledger, payouts and GST invoices in one system.
- You can offer delivery at cost because you already have the fleet and the routing.
- You can cross-sell marketplace demand to merchants who want it, without forcing it.
- You can serve segments that aggregators underserve: campus canteens, home chefs, cloud kitchens, sweet shops, bakeries, society kitchens.

**Competition**

DotPe, Thrive, Rista, Petpooja, Shipday, Shadowfax and others are in this space. Do not compete on "we have a website builder." Compete on:

- Full-stack settlement and GST (a real pain for merchants).
- Delivery at cost with density in your clusters.
- No lock-in and data ownership.
- A human onboarding team that sets up the menu and runs the first 30 days.

**Unit economics**

| Per merchant per month | ₹ |
|---|---:|
| Subscription | 1,999 |
| Platform fees (300 orders × ₹15) | 4,500 |
| Support / infra cost | (1,500) |
| **Contribution** | **~5,000 (77%)** |

At 200 merchants: about **₹10 lakh/month contribution**, with no delivery risk if delivery is passed through. This is the highest-margin line in the business.

**Risks**

- **B2B sales cycle:** restaurants are busy and skeptical. Use a done-for-you onboarding and a 30-day commission-savings guarantee.
- **Merchant-generated demand is not guaranteed:** some merchants will sign up and do nothing. Qualify for existing demand (they already have repeat customers) before onboarding.
- **Support burden:** 200 merchants × menu changes, refunds and payout questions is real. Build self-serve and a merchant SLA.
- **Disintermediation:** merchants may use you only for delivery and take payments direct. That is fine under this model; you are paid for software and logistics, not demand.

**What to build:** merchant slug/storefront, menu management, WhatsApp/payment links, merchant-owned customer list, delivery-at-cost billing, merchant analytics, GST invoices, payout statements.

---

### 5.4 Option — Surplus bags ("Last Bite")

**Concept:** merchants list end-of-day surplus at 50–70% off; customers reserve and pick up in a fixed window, or receive it in a batched route.

**Revenue:** fixed ₹25–30 per bag or 20% commission; merchant keeps the rest.

**Unit economics:** ₹199 bag, merchant ₹149, platform ₹47, payment/support ₹3 → **₹44 contribution**; pickup-only, so no rider cost.

**Why it works:** incremental revenue for merchants, low CAC for you, strong ESG story, and a reason for price-sensitive students to open the app.

**Why not first:** supply is unpredictable, food safety needs strict rules, and it can dilute the premium positioning of the pass. Launch it as a separate tab/brand in one cluster after the core is stable.

---

### 5.5 Option — Office Lunch Club

**Concept:** a company subsidizes or prepays lunches for employees; one delivery per floor at 12:30; dashboard, cost centers, monthly GST invoice.

**Revenue:** ₹15–25 per meal platform fee, or a ₹99/employee/month software fee plus per-meal food margin.

**Why it works:** the employer pays, so consumer CAC is near zero; retention is high; invoices and compliance are a moat. A 300-person office at 20 lunches/month × ₹15 = **₹90,000/month** in fees, before food margin.

**Why not first:** 4–8 week sales cycles and a single HR buyer. Pilot with one company after the campus pass proves operations.

---

### 5.6 Option — Kitchen capacity co-op

**Concept:** underutilized kitchens (restaurants idle 3–6pm, canteens idle weekends, home chefs) rent capacity to brands/chefs; you provide demand, dispatch, packaging, compliance and payments.

**Revenue:** ₹10,000–25,000/month per station + 8–12% fulfillment fee + supply margin.

**Why it works:** Kitopi proved the royalty/kitchen-as-a-service model; you can do an asset-light version in one city.

**Why not first:** quality control and utilization risk are high, and it requires demand density you do not have yet. Consider it in year two, after the pass and Kitchen OS.

---

### 5.7 Option — Embedded finance

**Concept:** use your ledger and payout data to offer instant merchant settlement, rider instant pay, revenue-based advances, and insurance.

**Revenue:** ₹10–20 per instant payout; 1.5–2% per month on advances; 10–20% commission on insurance.

**Why it works:** your ledger already knows what each merchant and rider has earned. Daily settlement is a genuine differentiator versus aggregators' weekly cycles.

**Why not first:** it requires an NBFC/bank partner, credit underwriting, collections and regulatory compliance. Do it after you have 12+ months of merchant repayment data. Start with instant payout (low risk), not lending.

---

### 5.8 Option — White-label the stack

**Concept:** license the platform to campus co-ops, tier-2 delivery entrepreneurs or restaurant associations: ₹25,000–50,000/month + 1–2% GMV + setup fee.

**Why it works:** high gross margin, recurring revenue, and it monetizes the codebase even if the operating business is slow.

**Why not first:** support burden, customizations and channel conflict. It is a good hedge or a side business, not the core.

### 5.9 What about ads-only?

Meituan proves that advertising can be a large profit pool. But ads require liquidity: advertisers pay for attention only when there are enough buyers. At 500 orders/day, an ads business is noise. Turn it on after 5,000+ orders/day, and keep it transparent: clearly labeled sponsored slots, frequency caps, and a quality floor. Do not let ads corrupt ranking before you have trust.

---

## 6. Scorecard and recommended sequence

Weights: merchant pull 25%, contribution margin 20%, capital efficiency 15%, speed to launch 15%, defensibility 15%, fit with existing code 10%.

| Model | Merchant pull | Contribution | Capital efficiency | Speed | Defensibility | Code fit | Weighted score |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Kitchen OS / DaaS** | 5 | 4 | 5 | 3 | 4 | 5 | **4.35** |
| **Open Pricing** | 5 | 3 | 5 | 5 | 3 | 5 | **4.30** |
| **Meal Pass** | 4 | 5 | 4 | 3 | 4 | 3 | **3.95** |
| Office Lunch Club | 4 | 4 | 4 | 2 | 4 | 3 | 3.60 |
| Embedded finance | 3 | 5 | 5 | 1 | 4 | 3 | 3.55 |
| White-label | 3 | 4 | 5 | 2 | 3 | 5 | 3.55 |
| Surplus bags | 3 | 3 | 4 | 4 | 2 | 4 | 3.25 |
| Kitchen co-op | 3 | 3 | 2 | 2 | 3 | 3 | 2.70 |

Ads-only is not scored: it is a phase-3 monetization layer that only works after liquidity, not a launch model.

**Kitchen OS and Open Pricing score highest, but Meal Pass should still go first.** Kitchen OS depends on merchant trust and a delivery density you do not have yet. Open Pricing is a pricing layer, not a demand engine; it needs merchants and customers to apply to. The Meal Pass creates both: it proves you can operate, gives you reference kitchens, and builds a daily habit with customers. Then Kitchen OS and Open Pricing compound.

### The sequence

**Phase 0 — weeks 0–6: prove one cluster**

- Pick one campus or office park in Delhi-NCR (the seed data and docs are already Delhi-centric).
- Sign 3 kitchens and one backup; agree menu, payout, SLA and FSSAI documents.
- Build P0: meal plans/credits, scheduled orders, batch dispatch, order source, commission floor/cap, merchant analytics.
- Pre-sell 100 passes for a 2-week pilot. Do not discount below ₹109/meal.

**Phase 1 — months 2–4: make the unit economics work**

- Reach 250 meals/day in cluster 1; measure meals/trip, on-time, refunds, contribution.
- Launch Open Pricing to 30 merchants in the same cluster. Use the commission-savings calculator as the sales tool.
- Add cluster 2 only if cluster 1 hits the go/no-go thresholds.

**Phase 2 — months 4–9: add the software layer**

- Launch Kitchen OS to the same partner kitchens and 50–100 nearby merchants.
- Add Office Lunch Club with one employer; use it to fill weekday demand.
- Reach 1,000–1,500 meals/day across 3–5 clusters; 150–250 marketplace orders/day.

**Phase 3 — months 9–18: scale and layer**

- 5,000 meals/day across ~20 clusters; 500 marketplace orders/day; 150 Kitchen OS merchants.
- Add surplus bags as a separate tab; test instant payout; evaluate ads only if orders/day > 5,000.
- Consider a small debt/advance pilot with an NBFC partner after 12 months of payout data.

### Contribution mix at scale (illustrative)

| Line | Monthly contribution | Share |
|---|---:|---:|
| Meal Pass | ₹34.3 lakh | 73% |
| Open Pricing marketplace | ₹6.0 lakh | 13% |
| Kitchen OS | ₹6.8 lakh | 14% |
| **Total** | **₹47.1 lakh** | **100%** |

The pass carries the volume; the marketplace and software improve margin per unit of density. This is a more resilient mix than a single commission line.

### Where the moat comes from

1. **Route density.** A competitor can copy your rate card but not your ability to put 8–10 meals into 2–4 building drop points at 12:30pm. Density is earned cluster by cluster.
2. **Merchant trust and switching costs.** Daily payouts, GST invoices, a transparent rate card and no lock-in make you the low-risk option. Once a kitchen's production plan and payouts run through you, switching is painful.
3. **The lunch habit.** A pass subscriber who eats with you 20 days a month is not choosing between you and Zomato every day. Habit is a better retention mechanism than discounts.
4. **The cluster playbook.** The second cluster should cost less and launch faster than the first. That repeatability is the real asset, not the code.
5. **Data.** Order source, meal preferences, kitchen reliability and route times let you underwrite delivery costs, price passes and, later, offer advances. This is proprietary operating data, not generic market data.

### Two ambition levels

- **Bootstrapped / lifestyle:** 1–2 clusters, 500–750 meals/day, 30–50 Kitchen OS merchants → roughly **₹4–7 lakh/month contribution**. Profitable without venture capital, but dependent on you and a small ops team.
- **Venture path:** ~20 clusters, 5,000 meals/day, 500 marketplace orders/day, 150 Kitchen OS merchants → roughly **₹47 lakh/month contribution**. Requires a repeatable cluster playbook, a regional ops team and capital for expansion.

Be honest about which one you want before you raise money or sign a lease. The models are the same; the operating tempo is not.

**If you only do one thing:** launch the Meal Pass in one cluster and prove **≥₹18 contribution per meal at ≥6 meals per trip**. If that works, add Open Pricing and Kitchen OS. If it does not, pivot to Kitchen OS for the same kitchens — it needs less consumer demand and has a clearer B2B buyer.

---

## 7. Illustrative financial model

### Assumptions

- Meal Pass: ₹129/meal at steady state (pilot early-adopter ₹125); kitchen ₹78; packaging ₹8; batched delivery ₹12; payment 2%; support/refunds 2%; contribution ₹26.4.
- 26 operating days/month (Mon–Sat; if you serve only Mon–Fri, use 22 days and multiply pass contribution by ~0.85).
- Marketplace: ₹400 AOV; 60% platform-originated; 12% capped at ₹49; ₹15 merchant fee; ₹5 customer fee; average delivery cost ₹25 (4 drops at maturity); contribution ₹40/order.
- Kitchen OS: ₹1,999/month + ₹15/order; 300 orders/merchant/month; 70% contribution margin after support.
- No steady-state discounting or paid CAC; the one-time pilot marketing budget is excluded (see section 8).
- Fixed costs include ops, support, rider supervision, tech/infra, accounting/legal.

### Three scenarios

| Metric | 1 cluster (steady) | 5 clusters | 20 clusters |
|---|---:|---:|---:|
| Meal Pass meals/day | 250 | 1,250 | 5,000 |
| Pass gross revenue (₹ lakh/month) | 8.4 | 41.9 | 167.7 |
| Pass contribution (₹ lakh/month) | 1.7 | 8.6 | 34.3 |
| Marketplace orders/day | 50 | 250 | 500 |
| Marketplace contribution (₹ lakh/month) | 0.6 | 3.0 | 6.0 |
| Kitchen OS merchants | 0 | 50 | 150 |
| Kitchen OS contribution (₹ lakh/month) | 0 | 2.3 | 6.8 |
| **Total contribution (₹ lakh/month)** | **2.3** | **13.9** | **47.1** |
| Fixed costs (₹ lakh/month) | 2.2 | 7.0 | 20.0 |
| **EBITDA (₹ lakh/month)** | **0.1** | **6.9** | **27.1** |

The single-cluster case is deliberately close to break-even: it is a learning vehicle, not a profit center. The scale case is a 24-month ambition, not a 6-month promise. If the pass contribution per meal falls below ₹18, the scale case does not work.

### Break-even batch math

The core operational variable is drops per trip. Assume a rider trip costs ₹40 for one drop, ₹60 for two, ₹100 for four and ₹160 for eight (the marginal cost per drop falls, but not to zero).

| Drops per trip | Rider cost/trip | Cost/order | Delivery fee ₹29: margin/order |
|---:|---:|---:|---:|
| 1 | ₹40 | ₹40 | –₹11 |
| 2 | ₹60 | ₹30 | –₹1 |
| 4 | ₹100 | ₹25 | +₹4 |
| 8 | ₹160 | ₹20 | +₹9 |

Delivery alone barely breaks even. The commission, merchant fee, customer platform fee and software subscription are what make the model profitable. **This is why "0% commission + solo delivery" is not a business; it is a subsidy.**

---

## 8. 90-day validation plan

### Weeks 1–2: pick the cluster and sign supply

- Choose one campus or office park with 3,000+ people and a single lunch peak. Talk to 30 potential customers and 10 kitchens.
- Sign 3 kitchens plus one backup. Collect FSSAI licenses, menus, capacity commitments, bank details and payout accounts.
- Agree: ₹78/meal payout, 10am cutoff, 98% on-time readiness, replacement/penalty policy, weekly payout.
- Clear the "BiteBox" trademark search before printing it on packaging.

### Weeks 3–4: build the minimum and pre-sell

- Build or manually operate the P0: pass purchase, meal credits, daily menu, cutoff, kitchen list, rider route, drop confirmation, refunds.
- Pre-sell 100 passes at ₹2,499 for the first 20 meals (an early-adopter ₹125/meal; standard ₹129), plus pay-as-you-go, targeting 150 meals/day by week 8. Include one free trial meal; do not set an ongoing price below ₹109.
- Set up a WhatsApp support line, a simple merchant dashboard and a daily ops sheet.

### Weeks 5–8: operate two weeks, then iterate

- Run 2 weeks at 100–150 meals/day. At 8–10 meals/trip that is 12–19 trips; use 4–6 gig riders doing 3–4 trips each, starting with 3 riders at 100 meals/day.
- Measure daily: meals/trip, on-time %, missing/late items, refunds, kitchen readiness, customer feedback, contribution/meal.
- Fix the top three operational failures before adding volume. Do not add a second cluster yet.

### Weeks 9–12: decide

- If the thresholds pass: hire an ops lead, add cluster 2, launch Open Pricing to 30 merchants, and start Kitchen OS onboarding for the partner kitchens.
- If the thresholds fail: diagnose whether the problem is demand (pass sales), price (contribution), operations (on-time/refunds) or supply (kitchen quality). If the pass cannot reach ₹18 contribution/meal at 6+ meals/trip, pivot to Kitchen OS for the same kitchens; it needs less consumer demand and has a clearer B2B buyer.

### Go/no-go thresholds

| Metric | Target by week 8 | Why it matters |
|---|---:|---|
| Meals per rider trip | ≥6 | Below this, delivery cost breaks the model. |
| Contribution per meal | ≥₹18 | Below this, fixed costs and refunds consume the margin. |
| On-time delivery (within 15 min) | ≥70% | This is the core customer promise. |
| Refund/replacement rate | <3% | Quality and ops health. |
| Repeat purchase in week 2 | ≥40% | Early signal of habit, not novelty. |
| 4-week retention | ≥25% | Subscription viability. |
| Kitchen readiness at cutoff | ≥98% | Supply reliability. |
| Customer acquisition cost per pass | <₹300 | Payback within the first month. |
| Daily meals by week 8 | ≥150 | Enough density to justify the full rider roster and a second cluster. |

### Pilot budget

| Item | ₹ |
|---|---:|
| Packaging, crates, branding | 1,00,000 |
| Riders (gig trips, ~3 months at ~100 meals/day) | 1,00,000 |
| Ops/rider supervision | 50,000 |
| Customer acquisition (ambassadors, trial meals) | 25,000 |
| Legal, CA, FSSAI, trademark | 50,000 |
| Tech/infra | 30,000 |
| Buffer | 95,000 |
| **Total** | **4,50,000** |

### Experiments worth running

- **Price:** ₹125 vs ₹129 vs ₹139; measure conversion, contribution and retention. Do not run a discount that you cannot sustain.
- **Batch size:** 6 vs 8 vs 10 meals/trip; measure rider cost, on-time and food temperature.
- **Menu:** 1 veg + 1 non-veg vs 2 veg + 1 non-veg; measure waste, satisfaction and kitchen complexity.
- **Channel:** campus ambassador vs WhatsApp group vs HR email; measure CAC and repeat.
- **Open Pricing:** offer 20 merchants "0% on your own customers" vs "12% capped" and measure sign-up, GMV and attribution disputes.
- **Kitchen OS:** offer 10 merchants a 30-day done-for-you setup; measure activation, orders and willingness to pay.

---

## 9. Risks, compliance and what would kill this

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Delivery density** | Every low-commission model depends on drops/trip; solo delivery loses money. | Launch only in dense clusters; measure meals/trip weekly; cap delivery radius. |
| **Food quality / safety** | One incident can end a campus contract and create liability. | FSSAI-verified kitchens (and confirm whether the platform needs its own registration), tasting approval, daily checks, replacement policy, insurance. |
| **Prepaid float** | Customer money held before meals are delivered can look like a deposit or wallet. | Designated account/escrow, revenue recognition as meals are delivered, refund unused credits, no general-purpose wallet, legal review. |
| **GST / TCS / TDS** | Food (5%), platform services (18%), e-commerce operator withholding and invoicing rules are easy to get wrong. | CA-reviewed flow; invoices/credit notes already modeled; confirm who is the supplier in each model. |
| **Rider classification** | Gig vs employee status, insurance, working hours. | Written contracts, insurance, transparent earnings, comply with Code on Social Security/e-Shram as applicable. |
| **Trademark** | The original working name "ZomatoFresh" was confusingly similar to Zomato; renamed to BiteBox. | Search "BiteBox" in trademark classes 35/39/43 before launch. |
| **Attribution disputes** | Merchants will challenge "platform-originated" vs "merchant-originated." | Signed links, last-touch 30-day rule, immutable order source, published policy, monthly audit. |
| **Discount addiction** | Discounted growth hides a broken unit economic model. | No platform-funded deep discounts; cap promotions; track contribution, not GMV. |
| **Incumbent response** | Zomato/Swiggy can copy a capped commission or a pass. | Compete on cluster density, merchant relationships and operational reliability; do not compete on selection. |
| **Merchant disintermediation** | Merchants may use your delivery but take payments direct. | That is acceptable under Kitchen OS; charge for software/logistics, not only demand. |
| **Expansion too early** | Each cluster has different kitchens, gate rules and demand patterns. | Nail one cluster's contribution and on-time metrics before adding the next. |
| **Data privacy** | Customer/merchant data, consent and retention. | DPDP-compliant consent, data minimization, merchant data ownership, no sale of personal data. |

### What would kill the business

- You cannot get to **6+ meals per trip** or **250 meals/day per cluster**.
- Kitchens cannot deliver consistent quality, and refunds/credits exceed 5%.
- You discount to buy demand and never earn back the contribution.
- You expand to 5 clusters before one cluster is profitable and operationally stable.
- You treat the pass as a wallet and mishandle customer float.

---

## 10. Build roadmap mapped to revenue

| Priority | Feature | Revenue model enabled | Rough effort |
|---|---|---|---|
| P0 | `orders.acquisition_channel` + signed merchant links/QR + last-touch attribution | Open Pricing; Kitchen OS | 1–2 weeks |
| P0 | `commission_min_paise`, `commission_max_paise` in pricing/settlement | Open Pricing | 2–3 days |
| P0 | Meal plans, subscriptions, credits, skip/pause, cutoff, scheduled order generation | Meal Pass | 2–3 weeks |
| P0 | Batch dispatch: group by cluster/time, multi-drop assignment, route sequence | Meal Pass; Open Pricing | 2–3 weeks |
| P0 | Merchant analytics: order-source mix, commission saved, payout statement | Sales tool for both merchant models | 1 week |
| P1 | Merchant storefront/link (`/m/[slug]`), menu management, WhatsApp/payment links | Kitchen OS; merchant-originated orders | 2 weeks |
| P1 | Corporate accounts, cost centers, monthly invoices | Office Lunch Club | 1–2 weeks |
| P1 | Surplus listings with pickup windows and fixed fee | Surplus bags | 1 week |
| P2 | Instant payout / advances with an NBFC partner | Embedded finance | 6–8 weeks + partner |
| P2 | Ads/ranking auction with sponsored labels | Ads-only layer | 4–6 weeks |
| P2 | White-label tenant configuration | White-label | 6–8 weeks |

Notes:

- The ledger already supports platform revenue, merchant payable, rider payable and tax payable. Adding new fee types is an extension, not a redesign.
- Payouts, invoices and credit notes already exist, which is why Kitchen OS is feasible without a finance rebuild.
- Batch dispatch is the highest-leverage engineering investment. It is the difference between a 10% contribution and a negative one.
- Do not build ads or lending before the density threshold. They are multipliers on a working core, not substitutes for one.

---

## 11. Sources and further reading

Market data and benchmarks (accessed 24 October 2026):

- Eternal/Zomato Q1 FY27 take rate 32.84%, contribution margin 10.2% and delivery costs — [BigGo Finance summary](https://finance.biggo.com/news/3471033b-125d-4303-8a3e-8c23a908d62f)
- NRAI update on Zomato's 30% service-fee cap (May 2025) — [NRAI](https://nrai.org/aboutNewsAndUpdate.aspx?ID=3VeXfPJ8SUg=&Type=oS9yZygW1hU=)
- DoorDash Q4/full-year 2025 results, net revenue margin 13.5% — [DoorDash IR](https://ir.doordash.com/news/news-details/2026/DoorDash-Releases-Fourth-Quarter-and-Full-Year-2025-Financial-Results/default.aspx)
- DoorDash commission tiers 15/25/30% and 6% pickup — [DoorDash Merchant](https://merchants.doordash.com/en-us/learning-center/delivery-commission); [Restolabs](https://www.restolabs.com/blog/how-much-does-doordash-charge-restaurants)
- DoorDash advertising ~12% of revenue, +73% YoY — [Opalink](https://opalink.com/blog/the-hidden-cost-of-doordash-advertising-how-restaurant-ad-spend-now-exceeds-delivery-commissions)
- Meituan 6–8% technology service fee — [MenuThere](https://menuthere.com/en/delivery-app-commission/meituan-china); revenue mix — [FNB](https://www.fnb.co.za/blog/investments/articles/EquityInsights-180624/)
- ONDC low-commission food ordering — [DineOpen](https://www.dineopen.com/blog/ondc-for-restaurants-india-guide.html)
- Direct ordering 0–5% + subscription — [Chuk](https://chuk.in/how-to-increase-customer-loyalty/); [Restrofi vs DotPe](https://restrofi.com/vs/dotpe); ChowNow flat-fee pricing — [ChowNow](https://get.chownow.com/pricing/)
- Too Good To Go fee per bag, US — [CNBC](https://www.cnbc.com/2024/11/16/how-too-good-to-go-helps-people-find-leftover-food-at-huge-discounts.html); UK fee structure — [ReLondon PDF](https://relondon.gov.uk/business/wp-content/uploads/2024/06/Too-Good-To-Go-How-it-works-2.pdf)
- India food-delivery orders and AOV — [Ken Research](https://www.kenresearch.com/industry-reports/india-online-food-delivery-market)
- Zomato/Swiggy market share — [Indmoney](https://www.indmoney.com/blog/stocks/swiggy-vs-zomato-fy25)
- Tiffin/meal subscription pricing — [Nomio](https://nomio.in/plans)
- Kitopi royalty model — [Element8](https://www.element8.sa/blog/redefining-the-food-beverage-industry-how-kitopi-is-transforming-the-future-of-cloud-kitchen/)
- Eternal quick commerce share of revenue — [Tijori](https://www.tijorifinance.com/company/zomato-ltd/)

Internal references:

- Product audit and remaining gaps — [production-readiness.md](../implementation/production-readiness.md)
- Existing campus/hyperlocal flat-fee vendor plan (₹40–50/day) — [24-future-hyperlocal-plug-in-architecture.md](../06-web-platform-implementation/24-future-hyperlocal-plug-in-architecture.md)
- Commission default and settlement model — [settlement.ts](../../packages/core/src/modules/payouts/settlement.ts)
- Pricing and GST engine — [pricing-calculator.ts](../../packages/core/src/modules/pricing/pricing-calculator.ts)
- Ledger — [ledger-model.ts](../../packages/core/src/modules/accounting/ledger-model.ts)
- Partner/payout/invoice schema — [0003_partners_payouts_invoices_support.sql](../../packages/database/migrations/0003_partners_payouts_invoices_support.sql)

---

## Appendix A: Formulas

**Capped-and-floored commission**

```
commission = min(max(food_subtotal × commission_bp / 10000, min_commission), max_commission)
```

**Contribution per order**

```
contribution = commission
             + merchant_order_fee
             + customer_platform_fee
             + delivery_fee
             - rider_cost
             - payment_gateway_fee
             - support_and_refund_cost
```

**Delivery cost per order**

```
delivery_cost_per_order = rider_cost_per_trip / drops_per_trip
```

**Meal Pass contribution**

```
contribution_per_meal = meal_price
                      - kitchen_payout
                      - packaging
                      - batched_delivery
                      - payment_fee
                      - support_and_refund
```

**Break-even drops per trip**

```
break_even_drops = rider_cost_per_trip / (delivery_fee + allocated_platform_fee_per_order)
```

## Appendix B: Open questions to answer in the pilot

1. What is the real rider cost per trip at 4, 6 and 8 drops in the chosen cluster?
2. What price holds repeat purchase at 40%+ without a subsidy: ₹125, ₹129 or ₹139?
3. Can one kitchen reliably produce 150–250 meals/day for 20 consecutive days? What is the failure rate?
4. What is the actual food cost and idle-capacity cost for partner kitchens at ₹78/meal?
5. Will merchants accept last-touch 30-day attribution, or does it kill the 0% pitch?
6. What is the employer's willingness to pay for the Office Lunch Club: per meal, per employee, or a flat monthly fee?
7. What is the true CAC through campus ambassadors vs WhatsApp vs HR?
8. How much of the pass demand cannibalizes marketplace orders, and how much is incremental?
9. What is the refund/credit rate when food is late or missing, and who bears it?
10. What is the legal structure for prepaid meal credits that keeps it out of RBI PPI territory?
