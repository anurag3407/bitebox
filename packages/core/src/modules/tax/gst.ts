import type { QuoteBreakdown } from "@startup/contracts";

export const GST_RATES = { FOOD_BP: 500, SERVICES_BP: 1800 } as const;

// SAC codes: restaurant service (supplied through the platform, s.9(5) CGST Act),
// local delivery, and the platform's own support service
export const SAC = { RESTAURANT_SERVICE: "996331", DELIVERY: "996813", PLATFORM_FEE: "998599" } as const;

/** Indian financial year (April–March) in IST, e.g. "2026-27". */
export function financialYear(at: Date): string {
  const ist = new Date(at.getTime() + 330 * 60_000);
  const year = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** GST invoice numbers must be unique per FY, sequential and at most 16 characters. */
export function formatInvoiceNumber(prefix: string, fy: string, seq: number): string {
  const number = `${prefix}${fy.slice(2, 4)}${fy.slice(5, 7)}-${String(seq).padStart(7, "0")}`;
  if (number.length > 16) throw new Error(`Invoice number ${number} exceeds 16 characters`);
  return number;
}

/** Intra-state supply: tax splits evenly into CGST and SGST (odd paise go to CGST). */
export function splitIntraState(taxPaise: number): { cgstPaise: number; sgstPaise: number } {
  const sgstPaise = Math.floor(taxPaise / 2);
  return { cgstPaise: taxPaise - sgstPaise, sgstPaise };
}

export interface InvoiceSection {
  title: string;
  sac: string;
  ratePercent: number;
  lines: Array<{ description: string; quantity?: number; amountPaise: number }>;
  discountPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  totalPaise: number;
}

/**
 * Splits an order bill into the two GST supplies of a food-delivery platform:
 * the restaurant's food service (5%) and the platform's delivery/fee services (18%).
 * Uses the tax split recorded at pricing time; older orders fall back to recomputing it.
 */
export function buildInvoiceSections(
  breakdown: QuoteBreakdown,
  items: Array<{ name: string; quantity: number; lineTotalPaise: number; variantName?: string }>
): { food: InvoiceSection; services: InvoiceSection; tipPaise: number; grandTotalPaise: number } {
  const foodDiscount = breakdown.foodDiscountPaise ?? Math.min(breakdown.discountPaise, breakdown.subtotalPaise);
  const serviceDiscount = breakdown.discountPaise - foodDiscount;
  const foodTax =
    breakdown.foodTaxPaise ?? Math.round(((breakdown.subtotalPaise - foodDiscount) * GST_RATES.FOOD_BP) / 10000);
  const servicesTax = breakdown.taxPaise - foodTax;

  const foodTaxable = breakdown.subtotalPaise - foodDiscount;
  const food: InvoiceSection = {
    title: "Restaurant service (supplied through the platform)",
    sac: SAC.RESTAURANT_SERVICE,
    ratePercent: GST_RATES.FOOD_BP / 100,
    lines: items.map((i) => ({
      description: i.variantName ? `${i.name} (${i.variantName})` : i.name,
      quantity: i.quantity,
      amountPaise: i.lineTotalPaise,
    })),
    discountPaise: foodDiscount,
    taxablePaise: foodTaxable,
    ...splitIntraState(foodTax),
    totalPaise: foodTaxable + foodTax,
  };

  const serviceLines = [
    { description: "Delivery charge", amountPaise: breakdown.deliveryFeePaise + breakdown.surgePaise },
    { description: "Packaging charge", amountPaise: breakdown.packagingPaise },
    { description: "Platform fee", amountPaise: breakdown.platformFeePaise },
  ].filter((l) => l.amountPaise > 0);
  const servicesGross = serviceLines.reduce((s, l) => s + l.amountPaise, 0);
  const servicesTaxable = servicesGross - serviceDiscount;
  const services: InvoiceSection = {
    title: "Delivery & platform services",
    sac: SAC.DELIVERY,
    ratePercent: GST_RATES.SERVICES_BP / 100,
    lines: serviceLines,
    discountPaise: serviceDiscount,
    taxablePaise: servicesTaxable,
    ...splitIntraState(servicesTax),
    totalPaise: servicesTaxable + servicesTax,
  };

  const tipPaise = breakdown.tipPaise ?? 0;
  return { food, services, tipPaise, grandTotalPaise: food.totalPaise + services.totalPaise + tipPaise };
}
