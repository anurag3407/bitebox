import { AcquisitionChannel, QuoteBreakdown } from "@startup/contracts";
import { priceOneTapAddon } from "../addons/addon-upsell.js";
import {
  SettlementCalculator,
  type CommissionCalculation,
  type CommissionPolicy,
} from "../payouts/settlement.js";

export interface PricingLineItem {
  basePricePaise: number;
  optionsPricePaise: number;
  quantity: number;
}

export interface CouponDiscountRule {
  type: "PERCENTAGE" | "FLAT" | "FREE_DELIVERY";
  discountValue: number; // percentage (e.g. 20) or flat paise (e.g. 5000); ignored for FREE_DELIVERY
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
  tipPaise?: number;
  deliveryFeeOverridePaise?: number;
}

export type CouponEvaluation =
  | { applicable: true; discountPaise: number }
  | { applicable: false; reason: string };

function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return `₹${Number.isInteger(rupees) ? rupees : rupees.toFixed(2)}`;
}

export class PricingCalculator {
  // Base delivery fee configuration
  static readonly BASE_DELIVERY_FEE_PAISE = 3000; // ₹30 base
  static readonly BASE_DELIVERY_DISTANCE_METERS = 3000; // up to 3km
  static readonly PER_KM_FEE_PAISE = 1000; // ₹10 per km beyond base
  static readonly DEFAULT_PACKAGING_PAISE = 2000; // ₹20
  static readonly DEFAULT_PLATFORM_FEE_PAISE = 500; // ₹5
  static readonly MAX_SURGE_MULTIPLIER = 2;
  // Fraud/abuse guard: very large carts need manual handling
  static readonly MAX_ORDER_SUBTOTAL_PAISE = 2_000_000; // ₹20,000

  // Tax rates in basis points (100 bp = 1%)
  static readonly FOOD_GST_BASIS_POINTS = 500; // 5% GST
  static readonly SERVICES_GST_BASIS_POINTS = 1800; // 18% GST on delivery & platform fee

  static calculateSubtotal(lines: PricingLineItem[]): number {
    let subtotalPaise = 0;
    for (const line of lines) {
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        throw new Error("Quantity must be a positive integer");
      }
      if (line.basePricePaise < 0 || line.optionsPricePaise < 0) {
        throw new Error("Prices cannot be negative");
      }
      const unitTotal = line.basePricePaise + line.optionsPricePaise;
      subtotalPaise += unitTotal * line.quantity;
    }
    return subtotalPaise;
  }

  static calculateDeliveryFee(distanceMeters: number): number {
    const distance = Math.max(0, distanceMeters);
    let deliveryFeePaise = PricingCalculator.BASE_DELIVERY_FEE_PAISE;
    if (distance > PricingCalculator.BASE_DELIVERY_DISTANCE_METERS) {
      const extraKm = Math.ceil((distance - PricingCalculator.BASE_DELIVERY_DISTANCE_METERS) / 1000);
      deliveryFeePaise += extraKm * PricingCalculator.PER_KM_FEE_PAISE;
    }
    return deliveryFeePaise;
  }

  /**
   * Decides whether a coupon applies to a cart and how much it is worth, with a
   * customer-facing reason when it does not.
   */
  static evaluateCoupon(
    coupon: CouponDiscountRule,
    subtotalPaise: number,
    deliveryFeePaise: number
  ): CouponEvaluation {
    const minOrder = coupon.minOrderPaise ?? 0;
    if (subtotalPaise < minOrder) {
      return {
        applicable: false,
        reason: `Add items worth ${formatRupees(minOrder - subtotalPaise)} more to use this coupon.`,
      };
    }

    let discountPaise = 0;
    if (coupon.type === "FLAT") {
      discountPaise = coupon.discountValue;
    } else if (coupon.type === "PERCENTAGE") {
      discountPaise = Math.round((subtotalPaise * coupon.discountValue) / 100);
    } else if (coupon.type === "FREE_DELIVERY") {
      discountPaise = deliveryFeePaise;
    }

    if (coupon.maxDiscountPaise !== undefined && coupon.maxDiscountPaise !== null) {
      discountPaise = Math.min(discountPaise, coupon.maxDiscountPaise);
    }
    // A coupon never makes food free beyond its value nor drives the bill negative
    const cap = coupon.type === "FREE_DELIVERY" ? deliveryFeePaise : subtotalPaise;
    discountPaise = Math.max(0, Math.min(discountPaise, cap));

    if (discountPaise === 0) {
      return { applicable: false, reason: "This coupon does not apply to your cart." };
    }
    return { applicable: true, discountPaise };
  }

  static calculateAddon(input: Parameters<typeof priceOneTapAddon>[0]) {
    return priceOneTapAddon(input);
  }

  /** Channel-aware capped/floored commission; exact paise math lives in SettlementCalculator. */
  static calculateCommission(input: {
    subtotalPaise: number;
    channel: AcquisitionChannel;
    policy: CommissionPolicy;
  }): CommissionCalculation {
    return SettlementCalculator.calculateCommission(input);
  }

  static calculate(input: PricingInput): QuoteBreakdown {    // 1. Calculate subtotal
    const subtotalPaise = PricingCalculator.calculateSubtotal(input.lines);

    // 2. Calculate delivery fee based on distance (or an explicit batch-slot quote)
    const deliveryFeePaise =
      input.deliveryFeeOverridePaise !== undefined
        ? Math.max(0, Math.round(input.deliveryFeeOverridePaise))
        : PricingCalculator.calculateDeliveryFee(input.distanceMeters);

    // Surge is bounded so a misconfigured multiplier cannot produce an abusive fee
    const surgeMultiplier = Math.min(
      PricingCalculator.MAX_SURGE_MULTIPLIER,
      Math.max(1, input.surgeMultiplier ?? 1)
    );
    const surgePaise = surgeMultiplier > 1 ? Math.round(deliveryFeePaise * (surgeMultiplier - 1)) : 0;

    // 3. Packaging & Platform fee
    const packagingPaise = Math.max(0, input.packagingFeePaise ?? PricingCalculator.DEFAULT_PACKAGING_PAISE);
    const platformFeePaise = Math.max(0, input.platformFeePaise ?? PricingCalculator.DEFAULT_PLATFORM_FEE_PAISE);
    const tipPaise = Math.max(0, Math.round(input.tipPaise ?? 0));

    // 4. Discounts (callers that need the rejection reason use evaluateCoupon directly)
    let discountPaise = 0;
    let foodDiscountPaise = 0;
    if (input.coupon) {
      const evaluation = PricingCalculator.evaluateCoupon(input.coupon, subtotalPaise, deliveryFeePaise);
      if (evaluation.applicable) {
        discountPaise = evaluation.discountPaise;
        foodDiscountPaise = input.coupon.type === "FREE_DELIVERY" ? 0 : discountPaise;
      }
    }

    // 5. Taxes (GST)
    // 5% on food subtotal after a food discount
    const taxableFoodSubtotal = Math.max(0, subtotalPaise - foodDiscountPaise);
    const foodTaxPaise = Math.round(
      (taxableFoodSubtotal * PricingCalculator.FOOD_GST_BASIS_POINTS) / 10000
    );

    // 18% on delivery + packaging + platform services (tips are not taxed)
    const deliveryDiscountPaise = discountPaise - foodDiscountPaise;
    const servicesSubtotal = Math.max(
      0,
      deliveryFeePaise + surgePaise + packagingPaise + platformFeePaise - deliveryDiscountPaise
    );
    const servicesTaxPaise = Math.round(
      (servicesSubtotal * PricingCalculator.SERVICES_GST_BASIS_POINTS) / 10000
    );

    const taxPaise = foodTaxPaise + servicesTaxPaise;

    // 6. Net payable total
    const payablePaise = Math.max(
      0,
      subtotalPaise +
        packagingPaise +
        deliveryFeePaise +
        platformFeePaise +
        surgePaise +
        taxPaise +
        tipPaise -
        discountPaise
    );

    return {
      subtotalPaise,
      packagingPaise,
      deliveryFeePaise,
      platformFeePaise,
      surgePaise,
      taxPaise,
      discountPaise,
      tipPaise,
      foodTaxPaise,
      foodDiscountPaise,
      payablePaise,
    };
  }
}
