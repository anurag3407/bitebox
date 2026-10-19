import { NextRequest } from "next/server";
import { CreateQuoteRequestSchema, QuoteLineBreakdown } from "@startup/contracts";
import {
  ModifierValidator,
  PricingCalculator,
  ServiceabilityPolicy,
} from "@startup/core";
import {
  AddressRepository,
  RestaurantRepository,
  coupons,
  getDb,
  quotes,
} from "@startup/database";
import { apiError, apiSuccess } from "@/server/api-response";
import { getAuthenticatedActor, getOrCreateDbUser } from "@/server/auth-guard";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const actor = await getAuthenticatedActor(req);
    if (!actor) {
      return apiError("UNAUTHENTICATED", "Authentication required to generate quote", 401);
    }

    const body = await req.json();
    const parsed = CreateQuoteRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid quote request", 400, parsed.error.format());
    }

    const { restaurantId, deliveryAddressId, destinationLocation, items, couponCode } =
      parsed.data;

    // 1. Fetch Restaurant & Menu
    const restaurant = await RestaurantRepository.findById(restaurantId);
    if (!restaurant) {
      return apiError("NOT_FOUND", "Restaurant not found", 404);
    }
    if (!restaurant.isAcceptingOrders || !restaurant.isOpen) {
      return apiError(
        "SERVICEABILITY_ERROR",
        "Restaurant is currently not accepting orders",
        422
      );
    }

    // 2. Fetch destination location
    let customerLocation = destinationLocation;
    if (deliveryAddressId) {
      const address = await AddressRepository.findById(deliveryAddressId);
      if (address) {
        customerLocation = {
          latitude: address.latitude,
          longitude: address.longitude,
        };
      }
    }
    if (!customerLocation) {
      customerLocation = { latitude: 28.6315, longitude: 77.2167 }; // Default fallback to Central Delhi
    }

    // 3. Distance check
    const restaurantLocation = {
      latitude: restaurant.latitude,
      longitude: restaurant.longitude,
    };
    const distanceMeters = ServiceabilityPolicy.calculateDistanceMeters(
      restaurantLocation,
      customerLocation
    );

    // 4. Validate items & modifiers
    const detail = await RestaurantRepository.findBySlug(restaurant.slug);
    if (!detail) {
      return apiError("NOT_FOUND", "Restaurant menu not found", 404);
    }

    const itemMap = new Map();
    for (const cat of detail.categories) {
      for (const item of cat.items) {
        itemMap.set(item.id, item);
      }
    }

    const quoteLines: QuoteLineBreakdown[] = [];
    for (const line of items) {
      const menuItem = itemMap.get(line.menuItemId);
      if (!menuItem) {
        return apiError("NOT_FOUND", `Item ${line.menuItemId} does not belong to this restaurant`, 422);
      }
      if (!menuItem.isAvailable) {
        return apiError("OUT_OF_STOCK", `Item "${menuItem.name}" is currently unavailable`, 422);
      }

      let basePrice = menuItem.pricePaise;
      let variantName: string | undefined;

      if (line.variantId) {
        const variant = menuItem.variants.find((v: any) => v.id === line.variantId);
        if (!variant || !variant.isAvailable) {
          return apiError("OUT_OF_STOCK", `Selected variant for "${menuItem.name}" is unavailable`, 422);
        }
        basePrice = variant.pricePaise;
        variantName = variant.name;
      }

      const modResult = ModifierValidator.validate(
        menuItem.modifierGroups,
        line.selectedOptionIds
      );
      if (!modResult.isValid) {
        return apiError("VALIDATION_ERROR", modResult.error || "Invalid modifiers", 422);
      }

      const lineTotal = (basePrice + modResult.optionsTotalPaise) * line.quantity;

      quoteLines.push({
        menuItemId: menuItem.id,
        name: menuItem.name,
        variantName,
        selectedOptionNames: modResult.selectedOptionNames,
        quantity: line.quantity,
        basePricePaise: basePrice,
        optionsPricePaise: modResult.optionsTotalPaise,
        lineTotalPaise: lineTotal,
        instructions: line.instructions,
      });
    }

    // 5. Coupon validation
    let couponDiscountRule: any = undefined;
    if (couponCode) {
      const db = getDb();
      const [coupon] = await db
        .select()
        .from(coupons)
        .where(eq(coupons.code, couponCode.toUpperCase()))
        .limit(1);

      if (coupon && coupon.isActive) {
        couponDiscountRule = {
          type: coupon.type,
          discountValue: coupon.discountValue,
          maxDiscountPaise: coupon.maxDiscountPaise ?? undefined,
          minOrderPaise: coupon.minOrderPaise,
        };
      }
    }

    // 6. Canonical pricing calculation
    const breakdown = PricingCalculator.calculate({
      lines: quoteLines.map((l) => ({
        basePricePaise: l.basePricePaise,
        optionsPricePaise: l.optionsPricePaise,
        quantity: l.quantity,
      })),
      distanceMeters,
      coupon: couponDiscountRule,
    });

    // 7. Store Quote
    const user = await getOrCreateDbUser(actor);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const db = getDb();
    const [savedQuote] = await db
      .insert(quotes)
      .values({
        customerId: user.id,
        restaurantId: restaurant.id,
        deliveryAddressId: deliveryAddressId ?? null,
        itemsJson: quoteLines,
        breakdownJson: breakdown,
        estimatedMinMinutes: restaurant.deliveryTimeMinMinutes,
        estimatedMaxMinutes: restaurant.deliveryTimeMaxMinutes,
        expiresAt,
      })
      .returning();

    if (!savedQuote) {
      return apiError("INTERNAL_ERROR", "Failed to persist quote", 500);
    }

    return apiSuccess({
      quoteId: savedQuote.id,
      restaurantId: restaurant.id,
      items: quoteLines,
      breakdown,
      estimatedMinMinutes: restaurant.deliveryTimeMinMinutes,
      estimatedMaxMinutes: restaurant.deliveryTimeMaxMinutes,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err: any) {
    return apiError("INTERNAL_ERROR", err.message || "Failed to generate quote", 500);
  }
}
