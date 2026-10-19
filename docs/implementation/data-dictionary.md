# Data Dictionary & Database Schema Reference

The platform database consists of 18 relational tables managed via Drizzle ORM and migrated in `packages/database/migrations/0001_initial.sql`.

## 1. Identity & Geography
- **`app_users`**:
  - `id` (UUID PK): Internal user identifier.
  - `clerk_user_id` (TEXT UNIQUE): External Clerk authentication reference.
  - `email` (TEXT), `phone` (TEXT), `name` (TEXT).
  - `role` (ENUM: `CUSTOMER`, `MERCHANT_STAFF`, `RIDER`, `ADMIN`).
- **`user_addresses`**:
  - `id` (UUID PK), `user_id` (UUID FK -> `app_users.id`).
  - `label` (TEXT: Home, Work, Other), `address_line1`, `address_line2`, `landmark`, `postal_code`.
  - `latitude` (NUMERIC 10,7), `longitude` (NUMERIC 10,7).
- **`cities`**:
  - `id` (UUID PK), `name` (TEXT), `state` (TEXT), `country_code` (TEXT: "IND"), `is_active` (BOOL).
- **`service_zones`**:
  - `id` (UUID PK), `city_id` (UUID FK -> `cities.id`), `name` (TEXT).
  - `polygon_geojson` (JSONB): Polygon boundary coordinates for spatial point-in-polygon checks.

---

## 2. Restaurant & Catalog
- **`restaurants`**:
  - `id` (UUID PK), `name` (TEXT), `slug` (TEXT UNIQUE), `zone_id` (UUID FK -> `service_zones.id`).
  - `latitude` (NUMERIC 10,7), `longitude` (NUMERIC 10,7), `address_line` (TEXT).
  - `cuisines` (TEXT ARRAY), `rating` (NUMERIC 3,2), `rating_count` (INT).
  - `cost_for_two_paise` (INT), `packaging_fee_paise` (INT).
  - `delivery_time_min_minutes` (INT), `delivery_time_max_minutes` (INT).
  - `is_active` (BOOL), `is_accepting_orders` (BOOL).
- **`menu_categories`**:
  - `id` (UUID PK), `restaurant_id` (UUID FK -> `restaurants.id`), `name` (TEXT), `sort_order` (INT).
- **`menu_items`**:
  - `id` (UUID PK), `restaurant_id` (UUID FK -> `restaurants.id`), `category_id` (UUID FK -> `menu_categories.id`).
  - `name` (TEXT), `description` (TEXT), `price_paise` (INT), `dietary_tag` (ENUM: `VEG`, `NON_VEG`, `EGG`, `VEGAN`).
  - `is_available` (BOOL), `is_popular` (BOOL).
- **`modifier_groups`**:
  - `id` (UUID PK), `menu_item_id` (UUID FK -> `menu_items.id`), `name` (TEXT).
  - `min_selections` (INT), `max_selections` (INT), `is_required` (BOOL).
- **`modifier_options`**:
  - `id` (UUID PK), `modifier_group_id` (UUID FK -> `modifier_groups.id`), `name` (TEXT), `additional_price_paise` (INT).

---

## 3. Orders & Pricing
- **`quotes`**:
  - `id` (UUID PK), `customer_id` (UUID FK -> `app_users.id`), `restaurant_id` (UUID FK -> `restaurants.id`).
  - `items_json` (JSONB), `breakdown_json` (JSONB): Immutable snapshot of fees, taxes, discounts, and total.
  - `expires_at` (TIMESTAMP WITH TIME ZONE): Default TTL 10 minutes.
- **`orders`**:
  - `id` (UUID PK), `order_number` (TEXT UNIQUE: e.g. `ORD-20261019-ABCD`).
  - `customer_id` (UUID FK -> `app_users.id`), `restaurant_id` (UUID FK -> `restaurants.id`).
  - `quote_id` (UUID FK -> `quotes.id`), `delivery_address_id` (UUID FK -> `user_addresses.id`).
  - `fulfillment_state` (ENUM: `PENDING_PAYMENT`, `AWAITING_MERCHANT`, `ACCEPTED`, `PREPARING`, `READY_FOR_PICKUP`, `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`, `DELIVERY_FAILED`).
  - `total_paise` (INT), `items_snapshot_json` (JSONB), `pricing_snapshot_json` (JSONB).
  - `delivery_otp` (TEXT: 6-digit cryptographic verification code).
  - `merchant_response_deadline_at` (TIMESTAMP WITH TIME ZONE): 90s SLA timer.
- **`order_items`**:
  - `id` (UUID PK), `order_id` (UUID FK -> `orders.id`), `menu_item_id` (UUID FK -> `menu_items.id`).
  - `name` (TEXT), `unit_price_paise` (INT), `quantity` (INT), `total_paise` (INT), `selected_modifiers_json` (JSONB).

---

## 4. Payments, Deliveries & Accounting
- **`payments`**:
  - `id` (UUID PK), `order_id` (UUID FK -> `orders.id`), `provider` (TEXT: "RAZORPAY").
  - `provider_order_id` (TEXT), `provider_payment_id` (TEXT), `amount_paise` (INT).
  - `status` (ENUM: `CREATED`, `AUTHORIZED`, `CAPTURED`, `FAILED`).
- **`refunds`**:
  - `id` (UUID PK), `order_id` (UUID FK -> `orders.id`), `amount_paise` (INT), `reason` (TEXT).
  - `status` (ENUM: `PENDING`, `PROCESSED`, `FAILED`).
- **`riders`**:
  - `id` (UUID PK), `user_id` (UUID FK -> `app_users.id`), `vehicle_type` (TEXT), `is_online` (BOOL), `is_busy` (BOOL).
- **`delivery_trips`**:
  - `id` (UUID PK), `order_id` (UUID FK -> `orders.id`), `rider_id` (UUID FK -> `riders.id`).
  - `status` (ENUM: `OFFERED`, `ACCEPTED`, `ARRIVED_AT_STORE`, `PICKED_UP`, `ARRIVED_AT_CUSTOMER`, `COMPLETED`, `CANCELLED`).
  - `pickup_latitude` (NUMERIC 10,7), `dropoff_latitude` (NUMERIC 10,7).
- **`jobs`**:
  - `id` (UUID PK), `job_type` (TEXT), `payload` (JSONB), `run_at` (TIMESTAMP), `status` (ENUM: `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`).
- **`idempotency_records`**:
  - `id` (UUID PK), `principal_id` (UUID), `operation` (TEXT), `idempotency_key` (TEXT), `response_payload` (JSONB).
  - Unique constraint on `(principal_id, operation, idempotency_key)`.
- **`ledger_entries`**:
  - `id` (UUID PK), `transaction_id` (UUID), `order_id` (UUID), `account_name` (TEXT), `direction` (ENUM: `DEBIT`, `CREDIT`), `amount_paise` (INT).
