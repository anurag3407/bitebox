import { QuoteBreakdown } from "@startup/contracts";
import { Money } from "../../shared/money.js";

export interface PricingLineItem {
  basePricePaise: number;
  optionsPricePaise: number;
  quantity: number;
}

export interface CouponDiscountRule {
  type: "PERCENTAGE" | "FLAT";
  discountValue: number; // percentage (e.g. 20) or flat paise (e.g. 5000)
  maxDiscountPaise?: number;
  minOrderPaise?: number;
}

export interface PricingInput {
  lines: PricingLineItem[];
  distanceMeters: number;
  packagingFeePaise?: number;
  platformFeePaise?: number;
  surgeMultiplier?: number;
  coupon?: CouponDiscountRule;
}

export class PricingCalculator {
  // Base delivery fee configuration
  static readonly BASE_DELIVERY_FEE_PAISE = 3000; // ₹30 base
  static readonly BASE_DELIVERY_DISTANCE_METERS = 3000; // up to 3km
  static readonly PER_KM_FEE_PAISE = 1000; // ₹10 per km beyond base
  static readonly DEFAULT_PACKAGING_PAISE = 2000; // ₹20
  static readonly DEFAULT_PLATFORM_FEE_PAISE = 500; // ₹5

  // Tax rates in basis points (100 bp = 1%)
  static readonly FOOD_GST_BASIS_POINTS = 500; // 5% GST
  static readonly SERVICES_GST_BASIS_POINTS = 1800; // 18% GST on delivery & platform fee

  static calculate(input: PricingInput): QuoteBreakdown {
    // 1. Calculate subtotal
    let subtotalPaise = 0;
    for (const line of input.lines) {
      if (line.quantity <= 0) {
        throw new Error("Quantity must be positive");
      }
      const unitTotal = line.basePricePaise + line.optionsPricePaise;
      subtotalPaise += unitTotal * line.quantity;
    }

    // 2. Calculate delivery fee based on distance
    const distanceMeters = Math.max(0, input.distanceMeters);
    let deliveryFeePaise = PricingCalculator.BASE_DELIVERY_FEE_PAISE;
    if (distanceMeters > PricingCalculator.BASE_DELIVERY_DISTANCE_METERS) {
      const extraMeters = distanceMeters - PricingCalculator.BASE_DELIVERY_DISTANCE_METERS;
      const extraKm = Math.ceil(extraMeters / 1000);
      deliveryFeePaise += extraKm * PricingCalculator.PER_KM_FEE_PAISE;
    }

    // Surge
    const surgeMultiplier = Math.max(1, input.surgeMultiplier ?? 1);
    const surgePaise =
      surgeMultiplier > 1
        ? Math.round(deliveryFeePaise * (surgeMultiplier - 1))
        : 0;

    // 3. Packaging & Platform fee
    const packagingPaise = Math.max(0, input.packagingFeePaise ?? PricingCalculator.DEFAULT_PACKAGING_PAISE);
    const platformFeePaise = Math.max(0, input.platformFeePaise ?? PricingCalculator.DEFAULT_PLATFORM_FEE_PAISE);

    // 4. Discounts
    let discountPaise = 0;
    if (input.coupon) {
      const minOrder = input.coupon.minOrderPaise ?? 0;
      if (subtotalPaise >= minOrder) {
        if (input.coupon.type === "FLAT") {
          discountPaise = Math.min(subtotalPaise, input.coupon.discountValue);
        } else if (input.coupon.type === "PERCENTAGE") {
          const rawDiscount = Math.round((subtotalPaise * input.coupon.discountValue) / 100);
          discountPaise = input.coupon.maxDiscountPaise
            ? Math.min(rawDiscount, input.coupon.maxDiscountPaise)
            : rawDiscount;
          discountPaise = Math.min(subtotalPaise, discountPaise);
        }
      }
    }

    // 5. Taxes (GST)
    // 5% on food subtotal (after discount allocation)
    const taxableFoodSubtotal = Math.max(0, subtotalPaise - discountPaise);
    const foodTaxPaise = Math.round(
      (taxableFoodSubtotal * PricingCalculator.FOOD_GST_BASIS_POINTS) / 10000
    );

    // 18% on delivery + packaging + platform services
    const servicesSubtotal = deliveryFeePaise + surgePaise + packagingPaise + platformFeePaise;
    const servicesTaxPaise = Math.round(
      (servicesSubtotal * PricingCalculator.SERVICES_GST_BASIS_POINTS) / 10000
    );

    const taxPaise = foodTaxPaise + servicesTaxPaise;

    // 6. Net payable total
    const payablePaise = Math.max(
      0,
      subtotalPaise + packagingPaise + deliveryFeePaise + platformFeePaise + surgePaise + taxPaise - discountPaise
    );

    return {
      subtotalPaise,
      packagingPaise,
      deliveryFeePaise,
      platformFeePaise,
      surgePaise,
      taxPaise,
      discountPaise,
      payablePaise,
    };
  }
}
