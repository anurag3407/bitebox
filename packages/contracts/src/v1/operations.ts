import { z } from "zod";
import { CoordinateSchema, OpeningHoursSchema } from "./dtos.js";

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
