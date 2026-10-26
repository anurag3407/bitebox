import { z } from "zod";
import { CoordinateSchema, OpeningHoursSchema } from "./dtos.js";
import {
  DiningReservationStatus,
  OrderIssueCategory,
  OrderIssueResolution,
  OrderMessageChannel,
  RiderDocumentType,
  SafetyEventType,
} from "./enums.js";

const IndianMobile = z.string().trim().regex(/^(\+91)?[6-9]\d{9}$/, "Enter a valid 10-digit mobile number");

// Partner onboarding ---------------------------------------------------------
export const MerchantApplicationSchema = z.object({
  legalBusinessName: z.string().trim().min(3).max(120),
  restaurantName: z.string().trim().min(2).max(80),
  fssaiLicenseNumber: z.string().trim().regex(/^\d{14}$/, "FSSAI licence numbers have 14 digits"),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Enter a valid 15-character GSTIN")
    .optional(),
  pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "Enter a valid PAN"),
  contactPhone: IndianMobile,
  contactEmail: z.string().trim().email(),
  addressText: z.string().trim().min(5).max(200),
  location: CoordinateSchema,
  cuisines: z.array(z.string().trim().min(2).max(30)).min(1).max(6),
  pureVeg: z.boolean().default(false),
  avgPriceForOnePaise: z.number().int().min(5000).max(500000),
});
export type MerchantApplication = z.infer<typeof MerchantApplicationSchema>;

export const RiderApplicationSchema = z.object({
  fullName: z.string().trim().min(3).max(80),
  phone: IndianMobile,
  vehicleType: z.enum(["BICYCLE", "SCOOTER", "MOTORCYCLE", "EV_SCOOTER"]),
  vehicleNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$/, "Enter the registration number without spaces, e.g. DL3CAB1234")
    .optional(),
  drivingLicenseNumber: z.string().trim().toUpperCase().min(10).max(20).optional(),
  city: z.string().trim().min(2).max(50),
});
export type RiderApplication = z.infer<typeof RiderApplicationSchema>;

export const ReviewApplicationSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().max(500).optional(),
});

export const AdminUpdateUserSchema = z
  .object({
    role: z.enum(["CUSTOMER", "MERCHANT_STAFF", "RIDER", "ADMIN"]).optional(),
    isActive: z.boolean().optional(),
    reason: z.string().trim().min(3).max(300),
  })
  .refine((v) => v.role !== undefined || v.isActive !== undefined, { message: "Nothing to update" });

export const AddStaffSchema = z.object({
  email: z.string().trim().email(),
  staffRole: z.enum(["MANAGER", "KITCHEN", "CATALOG_EDITOR"]),
});

// Menu editor ----------------------------------------------------------------
const Paise = z.number().int().min(0).max(10_000_000);

export const MenuCategoryInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().min(0).max(1000).optional(),
});

export const MenuItemInputSchema = z
  .object({
    categoryId: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(400).optional(),
    pricePaise: Paise.refine((v) => v >= 100, "Price must be at least ₹1"),
    dietaryTag: z.enum(["VEG", "NON_VEG", "EGG", "VEGAN"]),
    imageUrl: z.string().url().max(500).optional().or(z.literal("")),
    isBestseller: z.boolean().default(false),
    isAvailable: z.boolean().default(true),
    displayOrder: z.number().int().min(0).max(1000).default(0),
    allergens: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
    nutrition: z
      .object({
        calories: z.number().int().min(0).max(5000).optional(),
        proteinG: z.number().min(0).max(500).optional(),
        carbsG: z.number().min(0).max(500).optional(),
        fatG: z.number().min(0).max(500).optional(),
      })
      .optional(),
    spiceLevel: z.number().int().min(0).max(3).default(0),
    serves: z.number().int().min(1).max(20).optional(),
    variants: z
      .array(z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(40), pricePaise: Paise, isAvailable: z.boolean().default(true) }))
      .max(10)
      .default([]),
    modifierGroups: z
      .array(
        z.object({
          id: z.string().uuid().optional(),
          name: z.string().trim().min(1).max(40),
          minSelect: z.number().int().min(0).max(20),
          maxSelect: z.number().int().min(1).max(20),
          isRequired: z.boolean(),
          options: z
            .array(z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(40), pricePaise: Paise, isAvailable: z.boolean().default(true) }))
            .min(1)
            .max(30),
        })
      )
      .max(10)
      .default([]),
  })
  .superRefine((item, ctx) => {
    item.modifierGroups.forEach((g, i) => {
      if (g.minSelect > g.maxSelect) ctx.addIssue({ code: "custom", path: ["modifierGroups", i], message: `"${g.name}": minimum exceeds maximum` });
      if (g.maxSelect > g.options.length) ctx.addIssue({ code: "custom", path: ["modifierGroups", i], message: `"${g.name}": maximum exceeds the number of options` });
    });
  });
export type MenuItemInput = z.infer<typeof MenuItemInputSchema>;
export type MenuItemInputRaw = z.input<typeof MenuItemInputSchema>;

export const RestaurantSettingsSchema = z.object({
  description: z.string().trim().max(300).optional(),
  phone: IndianMobile.optional().or(z.string().regex(/^\+?\d{10,13}$/)),
  packagingFeePaise: Paise.optional(),
  avgPrepMinutes: z.number().int().min(5).max(90).optional(),
  avgPriceForOnePaise: z.number().int().min(5000).max(500000).optional(),
  heroImageUrl: z.string().url().max(500).optional(),
  isOpen: z.boolean().optional(),
  openingHours: OpeningHoursSchema.nullable().optional(),
  amenities: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  gallery: z.array(z.string().url().max(1000)).max(10).optional(),
  // Dining out
  acceptsReservations: z.boolean().optional(),
  reservationSlotMinutes: z.number().int().min(15).max(120).optional(),
  reservationCapacityPerSlot: z.number().int().min(1).max(100).optional(),
  maxPartySize: z.number().int().min(1).max(20).optional(),
  diningDescription: z.string().trim().max(500).optional(),
  hygieneRating: z.number().int().min(1).max(5).optional(),
});
export type RestaurantSettings = z.infer<typeof RestaurantSettingsSchema>;

// Payouts --------------------------------------------------------------------
export const PayoutAccountSchema = z.object({
  accountHolderName: z.string().trim().min(3).max(80),
  ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid 11-character IFSC"),
  accountNumber: z.string().trim().regex(/^\d{9,18}$/, "Account numbers have 9–18 digits"),
});

export const MarkPayoutPaidSchema = z.object({
  utr: z.string().trim().min(6).max(30),
});

// Support --------------------------------------------------------------------
export const SupportCategory = {
  MISSING_ITEM: "MISSING_ITEM",
  WRONG_ITEM: "WRONG_ITEM",
  QUALITY: "QUALITY",
  LATE_DELIVERY: "LATE_DELIVERY",
  PAYMENT: "PAYMENT",
  CANCELLATION: "CANCELLATION",
  OTHER: "OTHER",
} as const;
export type SupportCategory = (typeof SupportCategory)[keyof typeof SupportCategory];

export const CreateSupportTicketSchema = z.object({
  orderId: z.string().uuid().optional(),
  category: z.nativeEnum(SupportCategory),
  message: z.string().trim().min(3).max(2000),
});

export const SupportMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

export const ResolveTicketSchema = z.object({
  resolution: z.string().trim().min(3).max(500),
});

// Masked calling -------------------------------------------------------------
export const CallRequestSchema = z.object({
  target: z.enum(["RIDER", "CUSTOMER", "RESTAURANT"]),
});

// Refer & earn ---------------------------------------------------------------
export const ApplyReferralCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6,12}$/, "Enter a valid referral code"),
});

// Rider verification / KYC ---------------------------------------------------
export const RiderDocumentUploadSchema = z.object({
  docType: z.nativeEnum(RiderDocumentType),
  fileUrl: z.string().url().max(1000),
});
export type RiderDocumentUpload = z.infer<typeof RiderDocumentUploadSchema>;

export const SubmitRiderVerificationSchema = z.object({
  aadhaarLast4: z.string().trim().regex(/^\d{4}$/, "Enter the last 4 digits of your Aadhaar"),
  consentBackgroundCheck: z.literal(true, {
    errorMap: () => ({ message: "Consent to a background check is required" }),
  }),
});
export type SubmitRiderVerification = z.infer<typeof SubmitRiderVerificationSchema>;

export const ReviewRiderDocumentSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().max(300).optional(),
});

export const ReviewRiderVerificationSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "SUSPEND"]),
  note: z.string().trim().min(3).max(500),
});

// Order experience -----------------------------------------------------------
export const PurchaseMembershipSchema = z.object({
  planId: z.string().uuid(),
});

export const VerifyMembershipPaymentSchema = z.object({
  purchaseId: z.string().uuid(),
  razorpayOrderId: z.string().min(5),
  razorpayPaymentId: z.string().min(5),
  razorpaySignature: z.string().min(10),
});

export const MerchantCouponInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{4,20}$/, "Use 4–20 letters or numbers"),
    type: z.enum(["PERCENTAGE", "FLAT", "FREE_DELIVERY"]),
    discountValue: z.number().int().min(0).max(1_000_000),
    maxDiscountPaise: z.number().int().min(0).max(1_000_000).optional(),
    minOrderPaise: z.number().int().min(0).max(10_000_000).default(0),
    description: z.string().trim().max(140).optional(),
    validFrom: z.string().datetime({ offset: true }).optional(),
    validUntil: z.string().datetime({ offset: true }).optional(),
    usageLimitTotal: z.number().int().min(1).max(100_000).optional(),
    usageLimitPerUser: z.number().int().min(1).max(100).optional(),
    firstOrderOnly: z.boolean().default(false),
  })
  .superRefine((coupon, ctx) => {
    if (coupon.type === "PERCENTAGE" && (coupon.discountValue < 1 || coupon.discountValue > 100)) {
      ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Percentage must be between 1 and 100" });
    }
    if (coupon.type === "FLAT" && coupon.discountValue < 100) {
      ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Flat discount must be at least ₹1" });
    }
    if (coupon.type === "FREE_DELIVERY" && coupon.discountValue !== 0) {
      ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Free delivery coupons have no amount" });
    }
    if (coupon.validFrom && coupon.validUntil && new Date(coupon.validUntil) <= new Date(coupon.validFrom)) {
      ctx.addIssue({ code: "custom", path: ["validUntil"], message: "The end date must be after the start date" });
    }
  });
export type MerchantCouponInput = z.infer<typeof MerchantCouponInputSchema>;

export const MerchantCouponStatusSchema = z.object({
  isActive: z.boolean(),
});

export const ReplyToReviewSchema = z.object({
  reply: z.string().trim().min(3).max(500),
});

export const TipOrderSchema = z.object({
  amountPaise: z.number().int().min(1000).max(50000),
});

export const PickupHandoverSchema = z.object({
  pickupCode: z.string().trim().regex(/^\d{4,6}$/, "Enter the customer's pickup code"),
});

export const OrderMessageSchema = z.object({
  channel: z.nativeEnum(OrderMessageChannel),
  body: z.string().trim().min(1).max(1000),
});

export const DeliveryProofSchema = z.object({
  photoUrl: z.string().url().max(1000).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  note: z.string().trim().max(200).optional(),
});

export const OrderIssueRequestSchema = z.object({
  category: z.nativeEnum(OrderIssueCategory),
  description: z.string().trim().min(5).max(1000),
  itemIds: z.array(z.string().uuid()).max(30).default([]),
  photos: z.array(z.string().url().max(1000)).max(3).default([]),
});
export type OrderIssueRequest = z.infer<typeof OrderIssueRequestSchema>;

export const ResolveOrderIssueSchema = z.object({
  resolution: z.nativeEnum(OrderIssueResolution),
  walletCreditPaise: z.number().int().min(0).max(100_000).optional(),
  refundAmountPaise: z.number().int().min(0).max(100_000).optional(),
  couponCode: z.string().trim().max(30).optional(),
  note: z.string().trim().min(3).max(500),
});

// Dining out -----------------------------------------------------------------
export const DiningReservationRequestSchema = z.object({
  restaurantId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  slot: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a HH:MM time"),
  partySize: z.number().int().min(1).max(20),
  occasion: z.enum(["BIRTHDAY", "ANNIVERSARY", "DATE_NIGHT", "BUSINESS", "FAMILY", "OTHER"]).optional(),
  specialRequest: z.string().trim().max(300).optional(),
});
export type DiningReservationRequest = z.infer<typeof DiningReservationRequestSchema>;

export const UpdateDiningReservationSchema = z.object({
  status: z.nativeEnum(DiningReservationStatus),
});

// Safety & notifications -----------------------------------------------------
export const SafetyContactSchema = z.object({
  name: z.string().trim().min(2).max(60),
  phone: IndianMobile,
  relationship: z.string().trim().max(30).optional(),
  isPrimary: z.boolean().default(false),
});
export type SafetyContact = z.infer<typeof SafetyContactSchema>;

export const SafetyEventRequestSchema = z.object({
  eventType: z.nativeEnum(SafetyEventType),
  orderId: z.string().uuid().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  note: z.string().trim().max(500).optional(),
});

export const NotificationPreferencesSchema = z
  .object({
    orderUpdates: z.boolean().optional(),
    offers: z.boolean().optional(),
    referrals: z.boolean().optional(),
    newsletter: z.boolean().optional(),
    pushEnabled: z.boolean().optional(),
    smsEnabled: z.boolean().optional(),
    emailEnabled: z.boolean().optional(),
    whatsappEnabled: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update" });
