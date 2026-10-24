import { createHmac, timingSafeEqual } from "node:crypto";

export interface AddonPriceBreakdown {
  unitPricePaise: number;
  quantity: number;
  subtotalPaise: number;
  foodTaxPaise: number;
  payablePaise: number;
  grossMarginPaise: number;
}

/**
 * Add-ons ride in the parent's crate: no delivery fee and no platform fee.
 * Only food GST (5% by default) is added, and margin is tracked separately.
 */
export function priceOneTapAddon(input: {
  pricePaise: number;
  cogsPaise: number;
  quantity?: number;
  gstBasisPoints?: number;
}): AddonPriceBreakdown {
  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("quantity must be a positive integer");
  if (!Number.isInteger(input.pricePaise) || input.pricePaise <= 0) throw new Error("pricePaise must be positive");
  if (!Number.isInteger(input.cogsPaise) || input.cogsPaise < 0) throw new Error("cogsPaise cannot be negative");
  const gstBasisPoints = input.gstBasisPoints ?? 500;
  if (!Number.isInteger(gstBasisPoints) || gstBasisPoints < 0) throw new Error("gstBasisPoints cannot be negative");

  const subtotalPaise = input.pricePaise * quantity;
  const foodTaxPaise = Math.round((subtotalPaise * gstBasisPoints) / 10000);
  return {
    unitPricePaise: input.pricePaise,
    quantity,
    subtotalPaise,
    foodTaxPaise,
    payablePaise: subtotalPaise + foodTaxPaise,
    grossMarginPaise: (input.pricePaise - input.cogsPaise) * quantity,
  };
}

export function canAppendAddon(now: Date, slotCutoffAt: Date): boolean {
  return now.getTime() < slotCutoffAt.getTime();
}

export function selectUpsellSkus<T extends { isActive: boolean; stockCount: number }>(skus: T[], limit = 3): T[] {
  if (!Number.isInteger(limit) || limit <= 0) return [];
  return skus.filter((sku) => sku.isActive && sku.stockCount > 0).slice(0, limit);
}

/** The kitchen ticket and crate label must show one unified package. */
export function buildAddonBagLabel(parentBagLabel: string, addonName: string, quantity = 1): string {
  const base = parentBagLabel.trim() || "BAG";
  const name = addonName.trim().toUpperCase();
  return `${base} - +${quantity} ${name}`;
}

export interface AddonActionPayload {
  parentOrderId: string;
  addonSkuId: string;
  exp: number;
}

export function signAddonAction(payload: AddonActionPayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyAddonAction(token: string, secret: string, nowMs = Date.now()): AddonActionPayload | null {
  const split = token.lastIndexOf(".");
  if (split <= 0) return null;
  const encoded = token.slice(0, split);
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  const provided = token.slice(split + 1);
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AddonActionPayload;
    if (!payload.parentOrderId || !payload.addonSkuId || payload.exp * 1000 <= nowMs) return null;
    return payload;
  } catch {
    return null;
  }
}
