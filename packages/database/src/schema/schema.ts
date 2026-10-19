import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// 1. Identity & Auth
export const appUsers = pgTable("app_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  role: text("role").notNull().default("CUSTOMER"), // CUSTOMER, MERCHANT_STAFF, RIDER, ADMIN
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const platformRoleGrants = pgTable("platform_role_grants", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => appUsers.id),
  role: text("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const merchantMemberships = pgTable("merchant_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => appUsers.id),
  restaurantId: uuid("restaurant_id").notNull(), // Foreign key to restaurants.id
  staffRole: text("staff_role").notNull().default("MANAGER"), // OWNER, MANAGER, KITCHEN, CATALOG_EDITOR
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 2. Geography & Service Zones
export const cities = pgTable("cities", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const serviceZones = pgTable("service_zones", {
  id: uuid("id").primaryKey().defaultRandom(),
  cityId: uuid("city_id").notNull().references(() => cities.id),
  name: text("name").notNull(),
  polygonGeojson: jsonb("polygon_geojson").notNull(), // Array of { latitude, longitude }
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 3. Customer Addresses
export const customerAddresses = pgTable("customer_addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => appUsers.id),
  label: text("label").notNull(), // "Home", "Work", "Other"
  building: text("building").notNull(),
  street: text("street").notNull(),
  landmark: text("landmark"),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  contactPhone: text("contact_phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 4. Merchants & Outlets
export const merchants = pgTable("merchants", {
  id: uuid("id").primaryKey().defaultRandom(),
  legalBusinessName: text("legal_business_name").notNull(),
  fssaiLicenseNumber: text("fssai_license_number").notNull(),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone").notNull(),
  isVerified: boolean("is_verified").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const restaurants = pgTable("restaurants", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: uuid("merchant_id").notNull().references(() => merchants.id),
  cityId: uuid("city_id").notNull().references(() => cities.id),
  serviceZoneId: uuid("service_zone_id").notNull().references(() => serviceZones.id),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  cuisines: text("cuisines").array().notNull(), // e.g. ["North Indian", "Biryani"]
  rating: doublePrecision("rating").notNull().default(4.2),
  ratingCount: integer("rating_count").notNull().default(100),
  avgPriceForOnePaise: integer("avg_price_for_one_paise").notNull().default(25000), // ₹250
  deliveryTimeMinMinutes: integer("delivery_time_min_minutes").notNull().default(20),
  deliveryTimeMaxMinutes: integer("delivery_time_max_minutes").notNull().default(35),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  addressText: text("address_text").notNull().default("Main Market"),
  phone: text("phone"),
  isAcceptingOrders: boolean("is_accepting_orders").notNull().default(true),
  isOpen: boolean("is_open").notNull().default(true),
  pureVeg: boolean("pure_veg").notNull().default(false),
  heroImageUrl: text("hero_image_url"),
  offerTag: text("offer_tag"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 5. Menu & Modifiers
export const menuCategories = pgTable("menu_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id),
  name: text("name").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const menuItems = pgTable("menu_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id),
  categoryId: uuid("category_id").notNull().references(() => menuCategories.id),
  name: text("name").notNull(),
  description: text("description"),
  pricePaise: integer("price_paise").notNull(),
  dietaryTag: text("dietary_tag").notNull().default("NON_VEG"), // VEG, NON_VEG, EGG, VEGAN
  stockPolicy: text("stock_policy").notNull().default("UNTRACKED"),
  isAvailable: boolean("is_available").notNull().default(true),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const itemVariants = pgTable("item_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  menuItemId: uuid("menu_item_id").notNull().references(() => menuItems.id),
  name: text("name").notNull(), // e.g. "Half", "Full"
  pricePaise: integer("price_paise").notNull(),
  isAvailable: boolean("is_available").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const modifierGroups = pgTable("modifier_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  menuItemId: uuid("menu_item_id").notNull().references(() => menuItems.id),
  name: text("name").notNull(),
  minSelect: integer("min_select").notNull().default(0),
  maxSelect: integer("max_select").notNull().default(1),
  isRequired: boolean("is_required").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const modifierOptions = pgTable("modifier_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull().references(() => modifierGroups.id),
  name: text("name").notNull(),
  pricePaise: integer("price_paise").notNull().default(0),
  isAvailable: boolean("is_available").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 6. Coupons
export const coupons = pgTable("coupons", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  type: text("type").notNull().default("PERCENTAGE"), // PERCENTAGE, FLAT
  discountValue: integer("discount_value").notNull(), // percent or paise
  maxDiscountPaise: integer("max_discount_paise"),
  minOrderPaise: integer("min_order_paise").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 7. Quotes & Orders
export const quotes = pgTable("quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => appUsers.id),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id),
  deliveryAddressId: uuid("delivery_address_id").references(() => customerAddresses.id),
  itemsJson: jsonb("items_json").notNull(),
  breakdownJson: jsonb("breakdown_json").notNull(),
  estimatedMinMinutes: integer("estimated_min_minutes").notNull(),
  estimatedMaxMinutes: integer("estimated_max_minutes").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderNumber: text("order_number").notNull().unique(),
  customerId: uuid("customer_id").notNull().references(() => appUsers.id),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id),
  deliveryAddressId: uuid("delivery_address_id").notNull().references(() => customerAddresses.id),
  itemsJson: jsonb("items_json").notNull(),
  breakdownJson: jsonb("breakdown_json").notNull(),
  fulfillmentState: text("fulfillment_state").notNull().default("PENDING_PAYMENT"),
  paymentStatus: text("payment_status").notNull().default("PENDING"),
  payablePaise: integer("payable_paise").notNull(),
  deliveryOtp: text("delivery_otp").notNull(),
  pickupOtp: text("pickup_otp").notNull(),
  instructions: text("instructions"),
  promisedDeliveryAt: timestamp("promised_delivery_at", { withTimezone: true }),
  merchantResponseDeadlineAt: timestamp("merchant_response_deadline_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orderEvents = pgTable("order_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  sequence: integer("sequence").notNull(),
  sourceState: text("source_state").notNull(),
  targetState: text("target_state").notNull(),
  actorType: text("actor_type").notNull(), // CUSTOMER, MERCHANT, RIDER, ADMIN, SYSTEM
  actorId: text("actor_id"),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 8. Payments & Refunds
export const paymentAttempts = pgTable("payment_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  razorpayOrderId: text("razorpay_order_id").notNull(),
  status: text("status").notNull().default("CREATED"), // CREATED, READY, CAPTURED, FAILED
  amountPaise: integer("amount_paise").notNull(),
  currency: text("currency").notNull().default("INR"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  paymentAttemptId: uuid("payment_attempt_id").references(() => paymentAttempts.id),
  providerPaymentId: text("provider_payment_id").notNull().unique(), // Razorpay payment ID (e.g. pay_...)
  status: text("status").notNull().default("CAPTURED"),
  amountPaise: integer("amount_paise").notNull(),
  currency: text("currency").notNull().default("INR"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const refunds = pgTable("refunds", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  paymentId: uuid("payment_id").references(() => payments.id),
  providerRefundId: text("provider_refund_id").unique(),
  status: text("status").notNull().default("REQUESTED"), // REQUESTED, APPROVED, PROCESSED, FAILED
  amountPaise: integer("amount_paise").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 9. Riders, Offers & Trips
export const riders = pgTable("riders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => appUsers.id),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  vehicleType: text("vehicle_type").notNull().default("BIKE"),
  isApproved: boolean("is_approved").notNull().default(true),
  isOnline: boolean("is_online").notNull().default(false),
  currentLatitude: doublePrecision("current_latitude"),
  currentLongitude: doublePrecision("current_longitude"),
  lastPingAt: timestamp("last_ping_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deliveryOffers = pgTable("delivery_offers", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  riderId: uuid("rider_id").notNull().references(() => riders.id),
  status: text("status").notNull().default("OFFERED"), // OFFERED, ACCEPTED, REJECTED, EXPIRED, REVOKED
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deliveryAssignments = pgTable("delivery_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  riderId: uuid("rider_id").notNull().references(() => riders.id),
  status: text("status").notNull().default("ASSIGNED"), // ASSIGNED, AT_PICKUP, PICKED_UP, AT_DROPOFF, COMPLETED, CANCELLED
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// 10. Reliability, Idempotency & Outbox
export const idempotencyRecords = pgTable("idempotency_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  principalId: text("principal_id").notNull(),
  operation: text("operation").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(),
  responseJson: jsonb("response_json"),
  status: text("status").notNull().default("PROCESSING"), // PROCESSING, COMPLETED, FAILED
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webhookInbox = pgTable("webhook_inbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(), // RAZORPAY, CLERK, BREVO
  providerEventId: text("provider_event_id").notNull(),
  payloadJson: jsonb("payload_json").notNull(),
  status: text("status").notNull().default("PENDING"), // PENDING, PROCESSED, FAILED
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const outboxEvents = pgTable("outbox_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventType: text("event_type").notNull(),
  aggregateId: uuid("aggregate_id").notNull(),
  aggregateVersion: integer("aggregate_version").notNull().default(1),
  payloadJson: jsonb("payload_json").notNull(),
  status: text("status").notNull().default("PENDING"), // PENDING, PUBLISHED, FAILED
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  payloadJson: jsonb("payload_json").notNull(),
  status: text("status").notNull().default("PENDING"), // PENDING, PROCESSING, COMPLETED, FAILED
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  attemptCount: integer("attempt_count").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  leaseOwner: text("lease_owner"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 11. Accounting Ledger
export const ledgerTransactions = pgTable("ledger_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").references(() => orders.id),
  paymentId: uuid("payment_id").references(() => payments.id),
  refundId: uuid("refund_id").references(() => refunds.id),
  effectType: text("effect_type").notNull(), // CAPTURE, REFUND, PAYOUT
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ledgerEntries = pgTable("ledger_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  transactionId: uuid("transaction_id").notNull().references(() => ledgerTransactions.id),
  account: text("account").notNull(), // GATEWAY_CLEARING, MERCHANT_PAYABLE, RIDER_PAYABLE, etc.
  debitPaise: integer("debit_paise").notNull().default(0),
  creditPaise: integer("credit_paise").notNull().default(0),
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
