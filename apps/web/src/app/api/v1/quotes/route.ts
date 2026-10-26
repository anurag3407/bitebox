import { CreateQuoteRequestSchema, MenuItemDto, OrderMode, QuoteLineBreakdown, QuoteResponse } from "@startup/contracts";
import {
  CouponDiscountRule,
  DomainError,
  EtaCalculator,
  ModifierValidator,
  PricingCalculator,
  ServiceabilityPolicy,
} from "@startup/core";
import {
  AddressRepository,
  BatchRepository,
  CouponRepository,
  LoyaltyRepository,
  RestaurantRepository,
  evaluateAvailability,
  getDb,
  getDbPool,
  quotes,
  serviceZones,
} from "@startup/database";
import { MapboxAdapter } from "@startup/integrations";
import { eq } from "drizzle-orm";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { CacheKeys, cached } from "@/server/cache";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseBody, route } from "@/server/route";

const QUOTE_TTL_MINUTES = 10;

export const POST = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  await enforceRateLimit(req, "quote", auth.user.id);
  const {
    restaurantId,
    deliveryAddressId,
    destinationLocation,
    items,
    couponCode,
    tipPaise,
    dropPointId,
    slotWindow,
    orderMode,
    scheduledFor,
    contactless,
    cutleryOptIn,
    deliveryPreference,
  } = await parseBody(req, CreateQuoteRequestSchema);

  // 1. Restaurant must exist and be taking orders right now
  const restaurant = await RestaurantRepository.findById(restaurantId);
  if (!restaurant || !restaurant.isActive) throw new DomainError("NOT_FOUND", "Restaurant not found");
  const availability = evaluateAvailability(restaurant);
  if (!availability.isOpenNow) {
    throw new DomainError(
      "SERVICEABILITY_ERROR",
      availability.nextOpenText ? `This restaurant is closed. ${availability.nextOpenText}.` : "This restaurant is closed right now."
    );
  }
  if (!availability.isAcceptingOrders) {
    throw new DomainError("SERVICEABILITY_ERROR", "This restaurant is not accepting orders at the moment.");
  }

  const isPickup = orderMode === OrderMode.PICKUP;
  const restaurantLocation = { latitude: restaurant.latitude, longitude: restaurant.longitude };

  // 2. Destination: saved address for delivery, or the restaurant itself for pickup
  let destination = isPickup ? restaurantLocation : destinationLocation;
  if (!isPickup) {
    if (deliveryAddressId) {
      const address = await AddressRepository.findById(deliveryAddressId);
      if (!address || address.userId !== auth.user.id || address.isDeleted) {
        throw new DomainError("NOT_FOUND", "Delivery address not found");
      }
      destination = { latitude: address.latitude, longitude: address.longitude };
    }
    if (!destination) throw new DomainError("VALIDATION_ERROR", "A delivery location is required");
  }

  // 3. Serviceability applies to delivery only; anyone can collect from the outlet
  if (!isPickup) {
    const zones = await getDb().select().from(serviceZones).where(eq(serviceZones.isActive, true));
    const inZone = zones.some((z) =>
      ServiceabilityPolicy.isPointInPolygon(destination!, (z.polygonGeojson as Array<{ latitude: number; longitude: number }>) ?? [])
    );
    if (!inZone) throw new DomainError("SERVICEABILITY_ERROR", "We don't deliver to this location yet.");

    const radiusCheck = ServiceabilityPolicy.isRestaurantServiceable(
      restaurantLocation,
      destination!,
      restaurant.maxDeliveryRadiusMeters
    );
    if (!radiusCheck.isServiceable) {
      throw new DomainError("SERVICEABILITY_ERROR", "This restaurant does not deliver to your location.", {
        details: { distanceMeters: radiusCheck.distanceMeters },
      });
    }
  }

  // 4. Authoritative menu: prices, availability, variants and modifiers come from the server
  const detail = await cached(CacheKeys.menu(restaurant.slug), 30, () => RestaurantRepository.findBySlug(restaurant.slug));
  if (!detail) throw new DomainError("NOT_FOUND", "Restaurant menu not found");

  const itemMap = new Map<string, MenuItemDto>();
  for (const cat of detail.categories) for (const item of cat.items) itemMap.set(item.id, item);

  const quoteLines: QuoteLineBreakdown[] = [];
  for (const line of items) {
    const menuItem = itemMap.get(line.menuItemId);
    if (!menuItem) {
      throw new DomainError("OUT_OF_STOCK", "An item in your cart is no longer on the menu.", {
        details: { menuItemId: line.menuItemId },
      });
    }
    if (!menuItem.isAvailable) {
      throw new DomainError("OUT_OF_STOCK", `"${menuItem.name}" is currently unavailable.`, {
        details: { menuItemId: menuItem.id },
      });
    }

    const variantResult = ModifierValidator.resolveVariant(menuItem.name, menuItem.variants, line.variantId);
    if (!variantResult.ok) {
      throw new DomainError("OUT_OF_STOCK", variantResult.error, { details: { menuItemId: menuItem.id } });
    }
    const basePrice = variantResult.variant?.pricePaise ?? menuItem.pricePaise;

    const modResult = ModifierValidator.validate(menuItem.modifierGroups, line.selectedOptionIds);
    if (!modResult.isValid) {
      throw new DomainError("VALIDATION_ERROR", modResult.error || "Invalid customisation", {
        details: { menuItemId: menuItem.id },
      });
    }

    quoteLines.push({
      menuItemId: menuItem.id,
      name: menuItem.name,
      variantName: variantResult.variant?.name,
      selectedOptionNames: modResult.selectedOptionNames,
      quantity: line.quantity,
      basePricePaise: basePrice,
      optionsPricePaise: modResult.optionsTotalPaise,
      lineTotalPaise: (basePrice + modResult.optionsTotalPaise) * line.quantity,
      instructions: line.instructions,
    });
  }

  // 5. Road distance drives the delivery fee and ETA. Pickup has no last mile.
  const roadRoute = isPickup
    ? { distanceMeters: 0, durationSeconds: 0 }
    : await new MapboxAdapter().calculateRoute(restaurantLocation, destination!);

  const subtotal = PricingCalculator.calculateSubtotal(quoteLines);
  if (subtotal > PricingCalculator.MAX_ORDER_SUBTOTAL_PAISE) {
    throw new DomainError(
      "VALIDATION_ERROR",
      `Orders above ₹${PricingCalculator.MAX_ORDER_SUBTOTAL_PAISE / 100} need to be placed with support.`
    );
  }

  // Gold members get free delivery above their plan threshold
  const membership = await LoyaltyRepository.getActive(auth.user.id);
  const goldFreeDelivery =
    !isPickup &&
    !!membership &&
    membership.benefits.freeDeliveryAbovePaise !== undefined &&
    subtotal >= membership.benefits.freeDeliveryAbovePaise;

  // 6. Coupon: an invalid code never blocks the quote, it is reported back instead
  let couponRule: CouponDiscountRule | undefined;
  let couponError: string | undefined;
  let appliedCouponCode: string | undefined;
  if (couponCode) {
    const coupon = await CouponRepository.findByCode(couponCode);
    const eligibility = await CouponRepository.checkEligibility(getDbPool(), coupon,
      { userId: auth.user.id, restaurantId: restaurant.id }
    );
    if (!eligibility.ok) {
      couponError = eligibility.reason;
    } else {
      const evaluation = PricingCalculator.evaluateCoupon(
        eligibility.rule,
        subtotal,
        PricingCalculator.calculateDeliveryFee(roadRoute.distanceMeters)
      );
      if (evaluation.applicable) {
        couponRule = eligibility.rule;
        appliedCouponCode = coupon!.code;
      } else {
        couponError = evaluation.reason;
      }
    }
  }

  const breakdown = PricingCalculator.calculate({
    lines: quoteLines,
    distanceMeters: roadRoute.distanceMeters,
    packagingFeePaise: restaurant.packagingFeePaise,
    coupon: couponRule,
    tipPaise,
    deliveryFeeOverridePaise: isPickup || goldFreeDelivery
      ? 0
      : dropPointId && slotWindow
        ? (
            await BatchRepository.quoteSlot({
              dropPointId,
              slotWindow,
            })
          ).currentDeliveryFeePaise
        : undefined,
  });

  const eta = isPickup
    ? EtaCalculator.calculate({
        prepTimeMinutes: restaurant.avgPrepMinutes,
        travelToPickupMinutes: 0,
        lastMileTravelMinutes: 0,
      })
    : EtaCalculator.calculate({
        prepTimeMinutes: restaurant.avgPrepMinutes,
        travelToPickupMinutes: 8,
        lastMileTravelMinutes: Math.ceil(roadRoute.durationSeconds / 60),
      });

  // 7. Persist the quote: checkout charges exactly this, or asks the customer to re-price
  const expiresAt = new Date(Date.now() + QUOTE_TTL_MINUTES * 60 * 1000);
  const [savedQuote] = await getDb()
    .insert(quotes)
    .values({
      customerId: auth.user.id,
      restaurantId: restaurant.id,
      deliveryAddressId: isPickup ? null : deliveryAddressId ?? null,
      itemsJson: quoteLines,
      breakdownJson: breakdown,
      estimatedMinMinutes: eta.minEtaMinutes,
      estimatedMaxMinutes: eta.maxEtaMinutes,
      couponCode: appliedCouponCode ?? null,
      distanceMeters: isPickup ? 0 : roadRoute.distanceMeters,
      destinationLatitude: destination!.latitude,
      destinationLongitude: destination!.longitude,
      dropPointId: dropPointId ?? null,
      slotWindow: slotWindow ?? null,
      orderMode,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      contactless: isPickup ? false : contactless,
      cutleryOptIn,
      deliveryPreference: deliveryPreference ?? null,
      expiresAt,
    })
    .returning();

  if (!savedQuote) throw new Error("Failed to persist quote");

  const response: QuoteResponse = {
    quoteId: savedQuote.id,
    restaurantId: restaurant.id,
    items: quoteLines,
    breakdown,
    estimatedMinMinutes: eta.minEtaMinutes,
    estimatedMaxMinutes: eta.maxEtaMinutes,
    expiresAt: expiresAt.toISOString(),
    appliedCouponCode,
    couponError,
    membership: membership
      ? {
          name: membership.planName,
          freeDeliveryApplied: goldFreeDelivery,
          endsAt: membership.endsAt,
        }
      : undefined,
  };
  return apiSuccess(response, 200, { requestId });
});
