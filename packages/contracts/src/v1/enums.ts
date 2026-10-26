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

export const OrderMode = {
  DELIVERY: "DELIVERY",
  PICKUP: "PICKUP",
} as const;
export type OrderMode = (typeof OrderMode)[keyof typeof OrderMode];

export const PaymentMethod = {
  RAZORPAY: "RAZORPAY",
  WALLET: "WALLET",
  COD: "COD",
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const WalletTransactionKind = {
  REFERRAL_BONUS: "REFERRAL_BONUS",
  REFERRAL_WELCOME: "REFERRAL_WELCOME",
  REFUND_CREDIT: "REFUND_CREDIT",
  CASHBACK: "CASHBACK",
  GOODWILL: "GOODWILL",
  ORDER_PAYMENT: "ORDER_PAYMENT",
  REVERSAL: "REVERSAL",
  ADMIN_ADJUSTMENT: "ADMIN_ADJUSTMENT",
  RIDER_TIP: "RIDER_TIP",
  MEAL_PASS_PAYMENT: "MEAL_PASS_PAYMENT",
  GIFT_CARD_PURCHASE: "GIFT_CARD_PURCHASE",
  GIFT_CARD_REDEEM: "GIFT_CARD_REDEEM",
  DONATION: "DONATION",
  SPONSORSHIP_PAYMENT: "SPONSORSHIP_PAYMENT",
  SPLIT_PAYMENT: "SPLIT_PAYMENT",
  SPLIT_RECEIVED: "SPLIT_RECEIVED",
  EVENT_TICKET_PAYMENT: "EVENT_TICKET_PAYMENT",
} as const;
export type WalletTransactionKind = (typeof WalletTransactionKind)[keyof typeof WalletTransactionKind];

export const ReferralStatus = {
  PENDING: "PENDING",
  QUALIFIED: "QUALIFIED",
  REWARDED: "REWARDED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
} as const;
export type ReferralStatus = (typeof ReferralStatus)[keyof typeof ReferralStatus];

export const RiderVerificationStatus = {
  PENDING: "PENDING",
  IN_REVIEW: "IN_REVIEW",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
  SUSPENDED: "SUSPENDED",
} as const;
export type RiderVerificationStatus = (typeof RiderVerificationStatus)[keyof typeof RiderVerificationStatus];

export const RiderDocumentType = {
  PROFILE_PHOTO: "PROFILE_PHOTO",
  AADHAAR: "AADHAAR",
  PAN: "PAN",
  DRIVING_LICENSE: "DRIVING_LICENSE",
  VEHICLE_RC: "VEHICLE_RC",
  VEHICLE_INSURANCE: "VEHICLE_INSURANCE",
  POLICE_VERIFICATION: "POLICE_VERIFICATION",
} as const;
export type RiderDocumentType = (typeof RiderDocumentType)[keyof typeof RiderDocumentType];

export const OrderMessageChannel = {
  CUSTOMER_RIDER: "CUSTOMER_RIDER",
  CUSTOMER_MERCHANT: "CUSTOMER_MERCHANT",
} as const;
export type OrderMessageChannel = (typeof OrderMessageChannel)[keyof typeof OrderMessageChannel];

export const OrderMessageSender = {
  CUSTOMER: "CUSTOMER",
  RIDER: "RIDER",
  MERCHANT: "MERCHANT",
  SYSTEM: "SYSTEM",
} as const;
export type OrderMessageSender = (typeof OrderMessageSender)[keyof typeof OrderMessageSender];

export const OrderIssueCategory = {
  MISSING_ITEM: "MISSING_ITEM",
  WRONG_ITEM: "WRONG_ITEM",
  COLD_FOOD: "COLD_FOOD",
  QUALITY: "QUALITY",
  LATE_DELIVERY: "LATE_DELIVERY",
  SPILLED: "SPILLED",
  NOT_DELIVERED: "NOT_DELIVERED",
  OTHER: "OTHER",
} as const;
export type OrderIssueCategory = (typeof OrderIssueCategory)[keyof typeof OrderIssueCategory];

export const OrderIssueStatus = {
  OPEN: "OPEN",
  UNDER_REVIEW: "UNDER_REVIEW",
  RESOLVED: "RESOLVED",
  REJECTED: "REJECTED",
} as const;
export type OrderIssueStatus = (typeof OrderIssueStatus)[keyof typeof OrderIssueStatus];

export const OrderIssueResolution = {
  FULL_REFUND: "FULL_REFUND",
  PARTIAL_REFUND: "PARTIAL_REFUND",
  WALLET_CREDIT: "WALLET_CREDIT",
  REDELIVERY: "REDELIVERY",
  COUPON: "COUPON",
  NONE: "NONE",
} as const;
export type OrderIssueResolution = (typeof OrderIssueResolution)[keyof typeof OrderIssueResolution];

export const DiningReservationStatus = {
  CONFIRMED: "CONFIRMED",
  SEATED: "SEATED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  NO_SHOW: "NO_SHOW",
} as const;
export type DiningReservationStatus = (typeof DiningReservationStatus)[keyof typeof DiningReservationStatus];

export const SafetyEventType = {
  SOS: "SOS",
  TRACKING_SHARED: "TRACKING_SHARED",
  DELIVERY_CONCERN: "DELIVERY_CONCERN",
} as const;
export type SafetyEventType = (typeof SafetyEventType)[keyof typeof SafetyEventType];
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
