export const FulfillmentState = {
  PENDING_PAYMENT: "PENDING_PAYMENT",
  AWAITING_MERCHANT: "AWAITING_MERCHANT",
  ACCEPTED: "ACCEPTED",
  PREPARING: "PREPARING",
  READY_FOR_PICKUP: "READY_FOR_PICKUP",
  PICKED_UP: "PICKED_UP",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
  DELIVERY_FAILED: "DELIVERY_FAILED",
} as const;
export type FulfillmentState = (typeof FulfillmentState)[keyof typeof FulfillmentState];

export const PaymentAttemptStatus = {
  CREATED: "CREATED",
  PROVIDER_ORDER_CREATING: "PROVIDER_ORDER_CREATING",
  READY: "READY",
  UNKNOWN: "UNKNOWN",
  RECONCILING: "RECONCILING",
} as const;
export type PaymentAttemptStatus = (typeof PaymentAttemptStatus)[keyof typeof PaymentAttemptStatus];

export const PaymentStatus = {
  PENDING: "PENDING",
  AUTHORIZED: "AUTHORIZED",
  CAPTURED: "CAPTURED",
  FAILED: "FAILED",
  PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
  REFUNDED: "REFUNDED",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const RefundStatus = {
  REQUESTED: "REQUESTED",
  APPROVED: "APPROVED",
  SUBMITTING: "SUBMITTING",
  PENDING: "PENDING",
  PROCESSED: "PROCESSED",
  FAILED: "FAILED",
  UNKNOWN: "UNKNOWN",
} as const;
export type RefundStatus = (typeof RefundStatus)[keyof typeof RefundStatus];

export const DeliveryOfferStatus = {
  CREATED: "CREATED",
  OFFERED: "OFFERED",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  EXPIRED: "EXPIRED",
  REVOKED: "REVOKED",
} as const;
export type DeliveryOfferStatus = (typeof DeliveryOfferStatus)[keyof typeof DeliveryOfferStatus];

export const DeliveryTripStatus = {
  ASSIGNED: "ASSIGNED",
  AT_PICKUP: "AT_PICKUP",
  PICKED_UP: "PICKED_UP",
  AT_DROPOFF: "AT_DROPOFF",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  FAILED: "FAILED",
} as const;
export type DeliveryTripStatus = (typeof DeliveryTripStatus)[keyof typeof DeliveryTripStatus];

export const ChallengePurpose = {
  PICKUP: "PICKUP",
  DELIVERY: "DELIVERY",
} as const;
export type ChallengePurpose = (typeof ChallengePurpose)[keyof typeof ChallengePurpose];

export const ChallengeStatus = {
  ISSUED: "ISSUED",
  VERIFIED: "VERIFIED",
  EXPIRED: "EXPIRED",
  REVOKED: "REVOKED",
} as const;
export type ChallengeStatus = (typeof ChallengeStatus)[keyof typeof ChallengeStatus];

export const UserRole = {
  CUSTOMER: "CUSTOMER",
  MERCHANT_STAFF: "MERCHANT_STAFF",
  RIDER: "RIDER",
  ADMIN: "ADMIN",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const AcquisitionChannel = {
  MARKETPLACE: "MARKETPLACE",
  MERCHANT_DIRECT_SESSION: "MERCHANT_DIRECT_SESSION",
  MERCHANT_FIRST_ORIGIN: "MERCHANT_FIRST_ORIGIN",
  MEAL_PASS: "MEAL_PASS",
  CORPORATE_CLUB: "CORPORATE_CLUB",
  SURPLUS_BAG: "SURPLUS_BAG",
} as const;
export type AcquisitionChannel = (typeof AcquisitionChannel)[keyof typeof AcquisitionChannel];

export const FaultCode = {
  MERCHANT_QUALITY: "MERCHANT_QUALITY",
  MERCHANT_DELAY: "MERCHANT_DELAY",
  RIDER_DELAY: "RIDER_DELAY",
  PLATFORM_GOODWILL: "PLATFORM_GOODWILL",
} as const;
export type FaultCode = (typeof FaultCode)[keyof typeof FaultCode];

export const MealPassStatus = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  EXPIRED: "EXPIRED",
  EXHAUSTED: "EXHAUSTED",
} as const;
export type MealPassStatus = (typeof MealPassStatus)[keyof typeof MealPassStatus];

export const ScheduledMealStatus = {
  SCHEDULED: "SCHEDULED",
  SKIPPED_EARLY: "SKIPPED_EARLY",
  CONVERTED_TO_SURPLUS: "CONVERTED_TO_SURPLUS",
  LOCKED_FOR_PREP: "LOCKED_FOR_PREP",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
} as const;
export type ScheduledMealStatus = (typeof ScheduledMealStatus)[keyof typeof ScheduledMealStatus];

export const BatchStatus = {
  COLLECTING: "COLLECTING",
  THRESHOLD_MET: "THRESHOLD_MET",
  LOCKED: "LOCKED",
  IN_TRANSIT: "IN_TRANSIT",
  HANDED_TO_CAPTAIN: "HANDED_TO_CAPTAIN",
  COMPLETED: "COMPLETED",
} as const;
export type BatchStatus = (typeof BatchStatus)[keyof typeof BatchStatus];

export const SurplusListingStatus = {
  ACTIVE: "ACTIVE",
  SOLD_OUT: "SOLD_OUT",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
} as const;
export type SurplusListingStatus = (typeof SurplusListingStatus)[keyof typeof SurplusListingStatus];


export const MerchantStaffRole = {
  OWNER: "OWNER",
  MANAGER: "MANAGER",
  KITCHEN: "KITCHEN",
  CATALOG_EDITOR: "CATALOG_EDITOR",
} as const;
export type MerchantStaffRole = (typeof MerchantStaffRole)[keyof typeof MerchantStaffRole];

export const DietaryTag = {
  VEG: "VEG",
  NON_VEG: "NON_VEG",
  EGG: "EGG",
  VEGAN: "VEGAN",
} as const;
export type DietaryTag = (typeof DietaryTag)[keyof typeof DietaryTag];

export const StockPolicy = {
  TRACKED: "TRACKED",
  UNTRACKED: "UNTRACKED",
} as const;
export type StockPolicy = (typeof StockPolicy)[keyof typeof StockPolicy];

export const CouponType = {
  PERCENTAGE: "PERCENTAGE",
  FLAT: "FLAT",
  FREE_DELIVERY: "FREE_DELIVERY",
} as const;
export type CouponType = (typeof CouponType)[keyof typeof CouponType];

export const RestaurantSort = {
  RELEVANCE: "relevance",
  DISTANCE: "distance",
  RATING: "rating",
  DELIVERY_TIME: "delivery_time",
  COST_LOW_TO_HIGH: "cost_low_to_high",
  COST_HIGH_TO_LOW: "cost_high_to_low",
} as const;
export type RestaurantSort = (typeof RestaurantSort)[keyof typeof RestaurantSort];

export const Currency = {
  INR: "INR",
} as const;
export type Currency = (typeof Currency)[keyof typeof Currency];

export const DEMO_IDS = {
  cityId: "10000000-0000-4000-8000-000000000001",
  zoneId: "20000000-0000-4000-8000-000000000001",
  customerUserId: "30000000-0000-4000-8000-000000000001",
  merchantUserId: "30000000-0000-4000-8000-000000000002",
  riderUserId: "30000000-0000-4000-8000-000000000003",
  adminUserId: "30000000-0000-4000-8000-000000000004",
  customerAddressId: "40000000-0000-4000-8000-000000000001",
  merchantId: "50000000-0000-4000-8000-000000000001",
  restaurant1Id: "60000000-0000-4000-8000-000000000001",
  restaurant2Id: "60000000-0000-4000-8000-000000000002",
  restaurant3Id: "60000000-0000-4000-8000-000000000003",
  riderId: "70000000-0000-4000-8000-000000000001",
} as const;
