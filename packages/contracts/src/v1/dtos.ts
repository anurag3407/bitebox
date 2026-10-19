import { z } from "zod";
import {
  Currency,
  DietaryTag,
  FulfillmentState,
  PaymentStatus,
  RefundStatus,
  StockPolicy,
  UserRole,
} from "./enums.js";

// Basic Geolocation
export const CoordinateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export type Coordinate = z.infer<typeof CoordinateSchema>;

// Serviceability
export const ServiceabilityCheckRequestSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  restaurantId: z.string().uuid().optional(),
});
export type ServiceabilityCheckRequest = z.infer<typeof ServiceabilityCheckRequestSchema>;

export const ServiceabilityCheckResponseSchema = z.object({
  isServiceable: z.boolean(),
  zoneId: z.string().uuid().optional(),
  zoneName: z.string().optional(),
  estimatedDeliveryMinutes: z.number().int().positive().optional(),
  deliveryFeePaise: z.number().int().nonnegative().optional(),
  reason: z.string().optional(),
});
export type ServiceabilityCheckResponse = z.infer<typeof ServiceabilityCheckResponseSchema>;

// Catalog & Modifiers
export const ModifierOptionDtoSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  pricePaise: z.number().int().nonnegative(),
  isAvailable: z.boolean(),
});
export type ModifierOptionDto = z.infer<typeof ModifierOptionDtoSchema>;

export const ModifierGroupDtoSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  minSelect: z.number().int().nonnegative(),
  maxSelect: z.number().int().positive(),
  isRequired: z.boolean(),
  options: z.array(ModifierOptionDtoSchema),
});
export type ModifierGroupDto = z.infer<typeof ModifierGroupDtoSchema>;

export const ItemVariantDtoSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  pricePaise: z.number().int().nonnegative(),
  isAvailable: z.boolean(),
});
export type ItemVariantDto = z.infer<typeof ItemVariantDtoSchema>;

export const MenuItemDtoSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  pricePaise: z.number().int().nonnegative(),
  dietaryTag: z.nativeEnum(DietaryTag),
  stockPolicy: z.nativeEnum(StockPolicy).default(StockPolicy.UNTRACKED),
  isAvailable: z.boolean(),
  imageUrl: z.string().url().optional().or(z.string()),
  variants: z.array(ItemVariantDtoSchema).default([]),
  modifierGroups: z.array(ModifierGroupDtoSchema).default([]),
});
export type MenuItemDto = z.infer<typeof MenuItemDtoSchema>;

export const MenuCategoryDtoSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  displayOrder: z.number().int(),
  items: z.array(MenuItemDtoSchema),
});
export type MenuCategoryDto = z.infer<typeof MenuCategoryDtoSchema>;

export const RestaurantSummaryDtoSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
  cuisines: z.array(z.string()),
  rating: z.number().min(0).max(5),
  ratingCount: z.number().int().nonnegative(),
  avgPriceForOnePaise: z.number().int().positive(),
  deliveryTimeMinMinutes: z.number().int().positive(),
  deliveryTimeMaxMinutes: z.number().int().positive(),
  distanceMeters: z.number().int().nonnegative().optional(),
  isAcceptingOrders: z.boolean(),
  isOpen: z.boolean(),
  heroImageUrl: z.string().optional(),
  pureVeg: z.boolean(),
  offerTag: z.string().optional(),
});
export type RestaurantSummaryDto = z.infer<typeof RestaurantSummaryDtoSchema>;

export const RestaurantDetailDtoSchema = RestaurantSummaryDtoSchema.extend({
  addressText: z.string(),
  phone: z.string().optional(),
  categories: z.array(MenuCategoryDtoSchema),
});
export type RestaurantDetailDto = z.infer<typeof RestaurantDetailDtoSchema>;

// Search
export const SearchRequestSchema = z.object({
  q: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  pureVeg: z.boolean().optional(),
  cuisine: z.string().optional(),
  sortBy: z.enum(["relevance", "rating", "delivery_time", "cost_low_to_high", "cost_high_to_low"]).optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export type SearchRequest = z.infer<typeof SearchRequestSchema>;

export const SearchSuggestionDtoSchema = z.object({
  text: z.string(),
  type: z.enum(["restaurant", "dish", "cuisine"]),
  targetId: z.string().optional(),
  targetSlug: z.string().optional(),
});
export type SearchSuggestionDto = z.infer<typeof SearchSuggestionDtoSchema>;

export const SearchResultDtoSchema = z.object({
  restaurants: z.array(RestaurantSummaryDtoSchema),
  dishes: z.array(
    z.object({
      dish: MenuItemDtoSchema,
      restaurant: RestaurantSummaryDtoSchema,
    })
  ),
});
export type SearchResultDto = z.infer<typeof SearchResultDtoSchema>;

// Address
export const AddressDtoSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1),
  building: z.string().min(1),
  street: z.string().min(1),
  landmark: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  isDefault: z.boolean(),
  contactPhone: z.string().optional(),
});
export type AddressDto = z.infer<typeof AddressDtoSchema>;

export const CreateAddressRequestSchema = z.object({
  label: z.string().min(1),
  building: z.string().min(1),
  street: z.string().min(1),
  landmark: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  isDefault: z.boolean().default(false),
  contactPhone: z.string().optional(),
});
export type CreateAddressRequest = z.infer<typeof CreateAddressRequestSchema>;

// Cart & Quotes
export const CartItemInputSchema = z.object({
  menuItemId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  selectedOptionIds: z.array(z.string().uuid()).default([]),
  quantity: z.number().int().min(1).max(20),
  instructions: z.string().max(200).optional(),
});
export type CartItemInput = z.infer<typeof CartItemInputSchema>;

export const CreateQuoteRequestSchema = z.object({
  restaurantId: z.string().uuid(),
  deliveryAddressId: z.string().uuid().optional(),
  destinationLocation: CoordinateSchema.optional(),
  items: z.array(CartItemInputSchema).min(1),
  couponCode: z.string().max(30).optional(),
});
export type CreateQuoteRequest = z.infer<typeof CreateQuoteRequestSchema>;

export const QuoteLineBreakdownSchema = z.object({
  menuItemId: z.string().uuid(),
  name: z.string(),
  variantName: z.string().optional(),
  selectedOptionNames: z.array(z.string()).default([]),
  quantity: z.number().int().positive(),
  basePricePaise: z.number().int().nonnegative(),
  optionsPricePaise: z.number().int().nonnegative(),
  lineTotalPaise: z.number().int().nonnegative(),
  instructions: z.string().optional(),
});
export type QuoteLineBreakdown = z.infer<typeof QuoteLineBreakdownSchema>;

export const QuoteBreakdownSchema = z.object({
  subtotalPaise: z.number().int().nonnegative(),
  packagingPaise: z.number().int().nonnegative(),
  deliveryFeePaise: z.number().int().nonnegative(),
  platformFeePaise: z.number().int().nonnegative(),
  surgePaise: z.number().int().nonnegative(),
  taxPaise: z.number().int().nonnegative(),
  discountPaise: z.number().int().nonnegative(),
  payablePaise: z.number().int().nonnegative(),
});
export type QuoteBreakdown = z.infer<typeof QuoteBreakdownSchema>;

export const QuoteResponseSchema = z.object({
  quoteId: z.string().uuid(),
  restaurantId: z.string().uuid(),
  items: z.array(QuoteLineBreakdownSchema),
  breakdown: QuoteBreakdownSchema,
  estimatedMinMinutes: z.number().int().positive(),
  estimatedMaxMinutes: z.number().int().positive(),
  expiresAt: z.string(),
});
export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;

// Checkout & Order
export const CreateCheckoutRequestSchema = z.object({
  quoteId: z.string().uuid(),
  deliveryAddressId: z.string().uuid(),
  instructions: z.string().max(300).optional(),
  idempotencyKey: z.string().min(10).max(100),
});
export type CreateCheckoutRequest = z.infer<typeof CreateCheckoutRequestSchema>;

export const OrderSummaryDtoSchema = z.object({
  orderId: z.string().uuid(),
  orderNumber: z.string(),
  restaurantId: z.string().uuid(),
  restaurantName: z.string(),
  fulfillmentState: z.nativeEnum(FulfillmentState),
  payablePaise: z.number().int().nonnegative(),
  createdAt: z.string(),
  promisedDeliveryAt: z.string().optional(),
  itemCount: z.number().int().positive(),
});
export type OrderSummaryDto = z.infer<typeof OrderSummaryDtoSchema>;

export const OrderDetailDtoSchema = z.object({
  orderId: z.string().uuid(),
  orderNumber: z.string(),
  customerId: z.string().uuid().optional(),
  restaurant: z.object({
    id: z.string().uuid(),
    name: z.string(),
    phone: z.string().optional(),
    heroImageUrl: z.string().optional(),
  }),
  deliveryAddress: z.object({
    building: z.string(),
    street: z.string(),
    landmark: z.string().optional(),
    latitude: z.number(),
    longitude: z.number(),
    contactPhone: z.string().optional(),
  }),
  items: z.array(QuoteLineBreakdownSchema),
  breakdown: QuoteBreakdownSchema,
  fulfillmentState: z.nativeEnum(FulfillmentState),
  paymentStatus: z.nativeEnum(PaymentStatus),
  createdAt: z.string(),
  merchantResponseDeadlineAt: z.string().optional(),
  promisedDeliveryAt: z.string().optional(),
  currentEtaMinutes: z.number().int().positive().optional(),
  deliveryOtp: z.string().optional(),
});
export type OrderDetailDto = z.infer<typeof OrderDetailDtoSchema>;

// Payment
export const CreatePaymentAttemptRequestSchema = z.object({
  orderId: z.string().uuid(),
});
export type CreatePaymentAttemptRequest = z.infer<typeof CreatePaymentAttemptRequestSchema>;

export const CreatePaymentAttemptResponseSchema = z.object({
  attemptId: z.string().uuid(),
  orderId: z.string().uuid(),
  razorpayOrderId: z.string(),
  razorpayKeyId: z.string(),
  amountPaise: z.number().int().positive(),
  currency: z.nativeEnum(Currency),
});
export type CreatePaymentAttemptResponse = z.infer<typeof CreatePaymentAttemptResponseSchema>;

export const VerifyPaymentRequestSchema = z.object({
  orderId: z.string().uuid(),
  razorpayPaymentId: z.string().min(5),
  razorpayOrderId: z.string().min(5),
  razorpaySignature: z.string().min(10),
});
export type VerifyPaymentRequest = z.infer<typeof VerifyPaymentRequestSchema>;

export const PaymentStatusResponseSchema = z.object({
  orderId: z.string().uuid(),
  paymentStatus: z.nativeEnum(PaymentStatus),
  fulfillmentState: z.nativeEnum(FulfillmentState),
});
export type PaymentStatusResponse = z.infer<typeof PaymentStatusResponseSchema>;

// Tracking
export const OrderTrackingSnapshotSchema = z.object({
  orderId: z.string().uuid(),
  orderNumber: z.string(),
  fulfillmentState: z.nativeEnum(FulfillmentState),
  restaurant: z.object({
    name: z.string(),
    latitude: z.number(),
    longitude: z.number(),
  }),
  deliveryAddress: z.object({
    building: z.string(),
    street: z.string(),
    latitude: z.number(),
    longitude: z.number(),
  }),
  rider: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      phone: z.string().optional(),
      location: CoordinateSchema.optional(),
      headingDegrees: z.number().optional(),
      lastLocationUpdatedAt: z.string().optional(),
      isStale: z.boolean(),
    })
    .optional(),
  timeline: z.array(
    z.object({
      state: z.nativeEnum(FulfillmentState),
      timestamp: z.string(),
      description: z.string(),
      isCompleted: z.boolean(),
      isCurrent: z.boolean(),
    })
  ),
  currentEtaMinutes: z.number().int().positive().optional(),
  deliveryOtp: z.string().optional(),
});
export type OrderTrackingSnapshot = z.infer<typeof OrderTrackingSnapshotSchema>;

// Merchant
export const MerchantAcceptOrderRequestSchema = z.object({
  preparationTimeMinutes: z.number().int().min(5).max(120),
});
export type MerchantAcceptOrderRequest = z.infer<typeof MerchantAcceptOrderRequestSchema>;

export const MerchantRejectOrderRequestSchema = z.object({
  reason: z.string().min(3).max(200),
});
export type MerchantRejectOrderRequest = z.infer<typeof MerchantRejectOrderRequestSchema>;

// Rider
export const RiderLocationPingSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().nonnegative().optional(),
  headingDegrees: z.number().min(0).max(360).optional(),
  speedMps: z.number().nonnegative().optional(),
  capturedAt: z.string(),
});
export type RiderLocationPing = z.infer<typeof RiderLocationPingSchema>;

export const RiderMilestoneRequestSchema = z.object({
  challengeCode: z.string().regex(/^\d{4,6}$/).optional(),
});
export type RiderMilestoneRequest = z.infer<typeof RiderMilestoneRequestSchema>;

// Admin & Ops
export const ManualAssignRiderRequestSchema = z.object({
  riderId: z.string().uuid(),
  reason: z.string().min(3),
});
export type ManualAssignRiderRequest = z.infer<typeof ManualAssignRiderRequestSchema>;

export const RefundRequestSchema = z.object({
  amountPaise: z.number().int().positive(),
  reason: z.string().min(3),
});
export type RefundRequest = z.infer<typeof RefundRequestSchema>;

export const UpdateProfileRequestSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/, "Phone must be in E.164 format (e.g. +919876543210)").optional(),
});
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;
