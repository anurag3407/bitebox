import { z } from "zod";
import {
  AcquisitionChannel,
  Currency,
  DietaryTag,
  FaultCode,
  FulfillmentState,
  OrderMode,
  PaymentMethod,
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

export const NutritionSchema = z.object({
  calories: z.number().int().min(0).max(5000).optional(),
  proteinG: z.number().min(0).max(500).optional(),
  carbsG: z.number().min(0).max(500).optional(),
  fatG: z.number().min(0).max(500).optional(),
});
export type Nutrition = z.infer<typeof NutritionSchema>;

export const MenuItemDtoSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  pricePaise: z.number().int().nonnegative(),
  dietaryTag: z.nativeEnum(DietaryTag),
  stockPolicy: z.nativeEnum(StockPolicy).default(StockPolicy.UNTRACKED),
  isAvailable: z.boolean(),
  imageUrl: z.string().url().optional().or(z.string()),
  isBestseller: z.boolean().optional(),
  allergens: z.array(z.string()).default([]),
  nutrition: NutritionSchema.optional(),
  spiceLevel: z.number().int().min(0).max(3).optional(),
  serves: z.number().int().min(1).max(20).optional(),
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
  // Present when the request carried a location
  isServiceable: z.boolean().optional(),
  // Human readable reopening hint when closed, e.g. "Opens at 11:00 AM"
  nextOpenText: z.string().optional(),
  isFavorite: z.boolean().optional(),
  isSponsored: z.boolean().optional(),
  hygieneRating: z.number().int().min(1).max(5).optional(),
});
export type RestaurantSummaryDto = z.infer<typeof RestaurantSummaryDtoSchema>;

export const RestaurantListRequestSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  pureVeg: z.coerce.boolean().optional(),
  cuisine: z.string().max(40).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  maxDeliveryMinutes: z.coerce.number().int().min(10).max(120).optional(),
  hasOffer: z.coerce.boolean().optional(),
  sortBy: z
    .enum(["relevance", "distance", "rating", "delivery_time", "cost_low_to_high", "cost_high_to_low"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(1000).default(0),
});
export type RestaurantListRequest = z.infer<typeof RestaurantListRequestSchema>;

export const RestaurantListResponseSchema = z.object({
  restaurants: z.array(RestaurantSummaryDtoSchema),
  nextOffset: z.number().int().nullable(),
});
export type RestaurantListResponse = z.infer<typeof RestaurantListResponseSchema>;

export const OpeningHoursSchema = z.record(
  z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
  z.array(z.tuple([z.string().regex(/^\d{2}:\d{2}$/), z.string().regex(/^\d{2}:\d{2}$/)]))
);
export type OpeningHours = z.infer<typeof OpeningHoursSchema>;

export const RestaurantDetailDtoSchema = RestaurantSummaryDtoSchema.extend({
  addressText: z.string(),
  phone: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  openingHours: OpeningHoursSchema.optional(),
  amenities: z.array(z.string()).default([]),
  gallery: z.array(z.string()).default([]),
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

const IndianPhoneSchema = z
  .string()
  .trim()
  .regex(/^(\+91)?[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number");

export const CreateAddressRequestSchema = z.object({
  label: z.string().trim().min(1).max(30),
  building: z.string().trim().min(1).max(120),
  street: z.string().trim().min(1).max(200),
  landmark: z.string().trim().max(120).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  isDefault: z.boolean().default(false),
  contactPhone: IndianPhoneSchema.optional(),
});
export type CreateAddressRequest = z.infer<typeof CreateAddressRequestSchema>;
export type CreateAddressRequestInput = z.input<typeof CreateAddressRequestSchema>;

// Cart & Quotes
export const CartItemInputSchema = z.object({
  menuItemId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  selectedOptionIds: z.array(z.string().uuid()).default([]),
  quantity: z.number().int().min(1).max(20),
  instructions: z.string().trim().max(200).optional(),
});
export type CartItemInput = z.infer<typeof CartItemInputSchema>;

export const MAX_TIP_PAISE = 50_000;

export const CreateQuoteRequestSchema = z
  .object({
    restaurantId: z.string().uuid(),
    deliveryAddressId: z.string().uuid().optional(),
    destinationLocation: CoordinateSchema.optional(),
    items: z.array(CartItemInputSchema).min(1).max(50),
    couponCode: z.string().trim().max(30).optional(),
    tipPaise: z.number().int().min(0).max(MAX_TIP_PAISE).default(0),
    dropPointId: z.string().uuid().optional(),
    slotWindow: z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/).optional(),
    orderMode: z.nativeEnum(OrderMode).default(OrderMode.DELIVERY),
    // ISO timestamp for a scheduled delivery; must be in the future and within 7 days
    scheduledFor: z.string().datetime({ offset: true }).optional(),
    contactless: z.boolean().default(false),
    cutleryOptIn: z.boolean().default(true),
    deliveryPreference: z.enum(["DOOR", "RECEPTION", "SECURITY", "HAND_ME"]).optional(),
  })
  .refine((v) => v.orderMode === OrderMode.PICKUP || v.deliveryAddressId || v.destinationLocation, {
    message: "A delivery address or location is required to price the order",
    path: ["deliveryAddressId"],
  })
  .refine((v) => {
    if (!v.scheduledFor) return true;
    const at = new Date(v.scheduledFor).getTime();
    return at > Date.now() + 15 * 60 * 1000 && at < Date.now() + 7 * 24 * 60 * 60 * 1000;
  }, { message: "Schedule the order at least 15 minutes ahead, within the next 7 days", path: ["scheduledFor"] });
export type CreateQuoteRequest = z.infer<typeof CreateQuoteRequestSchema>;
export type CreateQuoteRequestInput = z.input<typeof CreateQuoteRequestSchema>;

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
  // Absent on orders created before tipping existed
  tipPaise: z.number().int().nonnegative().optional(),
  // GST split (food 5% vs services 18%) and the part of the discount applied to food; used for invoices
  foodTaxPaise: z.number().int().nonnegative().optional(),
  foodDiscountPaise: z.number().int().nonnegative().optional(),
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
  appliedCouponCode: z.string().optional(),
  // Set when a coupon was supplied but could not be applied; the quote is still valid without it
  couponError: z.string().optional(),
  membership: z
    .object({ name: z.string(), freeDeliveryApplied: z.boolean(), endsAt: z.string() })
    .optional(),
});
export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;

// Checkout & Order
export const CreateCheckoutRequestSchema = z
  .object({
    quoteId: z.string().uuid(),
    // Delivery orders require an address; pickup orders must omit it
    deliveryAddressId: z.string().uuid().optional(),
    instructions: z.string().trim().max(300).optional(),
    idempotencyKey: z.string().min(10).max(100),
    paymentMethod: z.nativeEnum(PaymentMethod).optional(),
    recipientName: z.string().trim().min(2).max(60).optional(),
    recipientPhone: IndianPhoneSchema.optional(),
    giftMessage: z.string().trim().max(200).optional(),
  })
  .refine((v) => !!v.recipientName === !!v.recipientPhone, {
    message: "Add both the recipient's name and mobile number",
    path: ["recipientName"],
  });

export const CheckoutResponseSchema = z.object({
  orderId: z.string().uuid(),
  orderNumber: z.string(),
  // Absent for wallet / cash-on-delivery orders, which never create a gateway attempt
  paymentAttemptId: z.string().uuid().optional(),
  razorpayOrderId: z.string().optional(),
  razorpayKeyId: z.string().optional(),
  amountPaise: z.number().int().positive(),
  currency: z.literal("INR"),
  isDuplicate: z.boolean(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
  // True when the server runs without real Razorpay credentials (local/dev only)
  simulatedPayment: z.boolean(),
});
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;
export type CreateCheckoutRequest = z.infer<typeof CreateCheckoutRequestSchema>;

export const OrderSummaryDtoSchema = z.object({
  orderId: z.string().uuid(),
  orderNumber: z.string(),
  restaurantId: z.string().uuid(),
  restaurantName: z.string(),
  restaurantSlug: z.string().optional(),
  restaurantImageUrl: z.string().optional(),
  fulfillmentState: z.nativeEnum(FulfillmentState),
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
  payablePaise: z.number().int().nonnegative(),
  createdAt: z.string(),
  promisedDeliveryAt: z.string().optional(),
  itemCount: z.number().int().positive(),
  itemsPreview: z.string().optional(),
  rating: z.number().int().min(1).max(5).optional(),
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
  // Only exposed to the restaurant's own staff: the rider reads it back at handover
  pickupCode: z.string().optional(),
  instructions: z.string().optional(),
  couponCode: z.string().optional(),
  orderMode: z.nativeEnum(OrderMode).optional(),
  scheduledFor: z.string().optional(),
  contactless: z.boolean().optional(),
  cutleryOptIn: z.boolean().optional(),
  deliveryPreference: z.string().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  deliveryProofUrl: z.string().optional(),
  pickupVerifiedAt: z.string().optional(),
  recipientName: z.string().optional(),
  recipientPhone: z.string().optional(),
  giftMessage: z.string().optional(),
  tipPaise: z.number().int().nonnegative().optional(),
  tipCreatedAt: z.string().optional(),
  prepTimeMinutes: z.number().int().positive().optional(),
  cancellationReason: z.string().optional(),
  acceptedAt: z.string().optional(),
  readyAt: z.string().optional(),
  pickedUpAt: z.string().optional(),
  deliveredAt: z.string().optional(),
  cancelledAt: z.string().optional(),
  refundedPaise: z.number().int().nonnegative().optional(),
  acquisitionChannel: z.nativeEnum(AcquisitionChannel).optional(),
  commissionPaise: z.number().int().nonnegative().optional(),
  merchantNetPayoutPaise: z.number().int().nonnegative().optional(),
  rider: z
    .object({
      name: z.string(),
      phone: z.string().optional(),
      vehicleType: z.string().optional(),
    })
    .optional(),
  rating: z
    .object({
      foodRating: z.number().int().min(1).max(5),
      deliveryRating: z.number().int().min(1).max(5).optional(),
      comment: z.string().optional(),
    })
    .optional(),
  canCancel: z.boolean().optional(),
  canRate: z.boolean().optional(),
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
  assignmentId: z.string().uuid(),
  nextStatus: z.enum(["AT_PICKUP", "PICKED_UP", "AT_DROPOFF", "COMPLETED", "FAILED"]),
  challengeCode: z.string().trim().regex(/^\d{4,6}$/).optional(),
  failureReason: z.string().trim().min(3).max(200).optional(),
});
export type RiderMilestoneRequestInput = z.infer<typeof RiderMilestoneRequestSchema>;

export const RiderStatusRequestSchema = z.object({
  isOnline: z.boolean(),
});

export const RiderRejectOfferRequestSchema = z.object({
  reason: z.string().trim().max(200).optional(),
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
  reason: z.string().trim().min(3).max(300),
  faultCode: z.nativeEnum(FaultCode).optional(),
});

export const AdminCancelOrderRequestSchema = z.object({
  reason: z.string().trim().min(3).max(300),
  // Defaults to the full refundable balance when omitted; 0 means cancel without refund
  refundAmountPaise: z.number().int().nonnegative().optional(),
  faultCode: z.nativeEnum(FaultCode).optional(),
});

export const CustomerCancelOrderRequestSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

// Merchant console
export const MerchantRestaurantStatusRequestSchema = z.object({
  isAcceptingOrders: z.boolean(),
});

export const MerchantItemAvailabilityRequestSchema = z.object({
  isAvailable: z.boolean(),
});

// Ratings & reviews
export const CreateOrderRatingRequestSchema = z.object({
  foodRating: z.number().int().min(1).max(5),
  deliveryRating: z.number().int().min(1).max(5).optional(),
  comment: z.string().trim().max(500).optional(),
  photos: z.array(z.string().url().max(1000)).max(3).optional(),
  dishRatings: z
    .array(z.object({ menuItemId: z.string().uuid(), rating: z.number().int().min(1).max(5) }))
    .max(30)
    .optional(),
});
export type CreateOrderRatingRequest = z.infer<typeof CreateOrderRatingRequestSchema>;

export const RestaurantReviewDtoSchema = z.object({
  id: z.string().uuid(),
  customerName: z.string(),
  foodRating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
  photos: z.array(z.string()).default([]),
  dishRatings: z.array(z.object({ menuItemId: z.string().uuid(), name: z.string(), rating: z.number().int().min(1).max(5) })).default([]),
  restaurantReply: z.string().optional(),
  restaurantRepliedAt: z.string().optional(),
  createdAt: z.string(),
});
export type RestaurantReviewDto = z.infer<typeof RestaurantReviewDtoSchema>;

// Web push (PWA)
export const PushSubscriptionRequestSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(10).max(200),
    auth: z.string().min(5).max(100),
  }),
});
export type PushSubscriptionRequest = z.infer<typeof PushSubscriptionRequestSchema>;
export type RefundRequest = z.infer<typeof RefundRequestSchema>;

export const UpdateProfileRequestSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/, "Phone must be in E.164 format (e.g. +919876543210)").optional(),
});
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

// Group ordering
export const GroupCartStatusSchema = z.enum(["OPEN", "LOCKED", "COMPLETED", "ABANDONED"]);
export type GroupCartStatus = z.infer<typeof GroupCartStatusSchema>;

export const GroupCartOptionDtoSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  pricePaise: z.number().int().nonnegative(),
});
export type GroupCartOptionDto = z.infer<typeof GroupCartOptionDtoSchema>;

export const GroupCartLineDtoSchema = z.object({
  id: z.string().uuid(),
  participantId: z.string().uuid(),
  participantName: z.string(),
  menuItemId: z.string().uuid(),
  name: z.string(),
  variantId: z.string().uuid().optional(),
  variantName: z.string().optional(),
  basePricePaise: z.number().int().nonnegative(),
  selectedOptions: z.array(GroupCartOptionDtoSchema).default([]),
  unitPricePaise: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  lineTotalPaise: z.number().int().nonnegative(),
  notes: z.string().optional(),
  imageUrl: z.string().optional(),
  isVeg: z.boolean(),
  canEdit: z.boolean(),
});
export type GroupCartLineDto = z.infer<typeof GroupCartLineDtoSchema>;

export const GroupCartParticipantDtoSchema = z.object({
  userId: z.string().uuid(),
  name: z.string(),
  isHost: z.boolean(),
  itemCount: z.number().int().nonnegative(),
  subtotalPaise: z.number().int().nonnegative(),
});
export type GroupCartParticipantDto = z.infer<typeof GroupCartParticipantDtoSchema>;

export const GroupCartDtoSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  status: GroupCartStatusSchema,
  restaurantId: z.string().uuid(),
  restaurantName: z.string(),
  restaurantSlug: z.string(),
  hostId: z.string().uuid(),
  hostName: z.string(),
  viewerId: z.string().uuid(),
  orderId: z.string().uuid().optional(),
  expiresAt: z.string(),
  createdAt: z.string(),
  isHost: z.boolean(),
  isParticipant: z.boolean(),
  participants: z.array(GroupCartParticipantDtoSchema),
  lines: z.array(GroupCartLineDtoSchema),
  participantCount: z.number().int().positive(),
  itemCount: z.number().int().nonnegative(),
  subtotalPaise: z.number().int().nonnegative(),
});
export type GroupCartDto = z.infer<typeof GroupCartDtoSchema>;

export const CreateGroupCartRequestSchema = z.object({
  restaurantId: z.string().uuid(),
});
export type CreateGroupCartRequest = z.infer<typeof CreateGroupCartRequestSchema>;

export const AddGroupCartItemRequestSchema = z.object({
  menuItemId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  selectedOptionIds: z.array(z.string().uuid()).max(20).default([]),
  quantity: z.number().int().min(1).max(20),
  notes: z.string().trim().max(200).optional(),
});
export type AddGroupCartItemRequest = z.infer<typeof AddGroupCartItemRequestSchema>;

export const UpdateGroupCartItemRequestSchema = z.object({
  quantity: z.number().int().min(0).max(20),
});
export type UpdateGroupCartItemRequest = z.infer<typeof UpdateGroupCartItemRequestSchema>;

export const CompleteGroupCartRequestSchema = z.object({
  orderId: z.string().uuid(),
});
export type CompleteGroupCartRequest = z.infer<typeof CompleteGroupCartRequestSchema>;

// Dining events / Zomato Live
export const DiningEventCategorySchema = z.enum(["DINING", "MUSIC", "COMEDY", "WORKSHOP"]);
export type DiningEventCategory = z.infer<typeof DiningEventCategorySchema>;

export const DiningEventDtoSchema = z.object({
  id: z.string().uuid(),
  restaurantId: z.string().uuid(),
  restaurantName: z.string(),
  restaurantSlug: z.string(),
  title: z.string(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  category: DiningEventCategorySchema,
  startsAt: z.string(),
  endsAt: z.string(),
  pricePaise: z.number().int().nonnegative(),
  capacity: z.number().int().positive(),
  bookedCount: z.number().int().nonnegative(),
  seatsLeft: z.number().int().nonnegative(),
  venue: z.string(),
  isActive: z.boolean(),
});
export type DiningEventDto = z.infer<typeof DiningEventDtoSchema>;

export const DiningEventBookingDtoSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  eventTitle: z.string(),
  restaurantName: z.string(),
  restaurantSlug: z.string(),
  imageUrl: z.string().optional(),
  startsAt: z.string(),
  venue: z.string(),
  quantity: z.number().int().positive(),
  totalPaise: z.number().int().nonnegative(),
  status: z.enum(["CONFIRMED", "CANCELLED"]),
  bookingCode: z.string(),
  canCancel: z.boolean(),
  createdAt: z.string(),
});
export type DiningEventBookingDto = z.infer<typeof DiningEventBookingDtoSchema>;

export const BookDiningEventRequestSchema = z.object({
  quantity: z.number().int().min(1).max(6),
});
export type BookDiningEventRequest = z.infer<typeof BookDiningEventRequestSchema>;

// Curated collections
export const CollectionSummaryDtoSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  imageUrl: z.string().optional(),
  restaurantCount: z.number().int().nonnegative(),
});
export type CollectionSummaryDto = z.infer<typeof CollectionSummaryDtoSchema>;

export const CollectionDetailDtoSchema = CollectionSummaryDtoSchema.extend({
  description: z.string().optional(),
  restaurants: z.array(RestaurantSummaryDtoSchema),
});
export type CollectionDetailDto = z.infer<typeof CollectionDetailDtoSchema>;
