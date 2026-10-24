export interface SurplusPrice {
  originalValuePaise: number;
  salePricePaise: number;
  discountPaise: number;
  platformFeePaise: number;
  merchantProceedsPaise: number;
  discountBp: number;
}

/** Fixed-fee rescue bag: the merchant keeps the sale price minus the platform fee. */
export function priceSurplusBag(input: {
  originalValuePaise: number;
  platformFlatFeePaise: number;
  discountBp?: number;
}): SurplusPrice {
  const discountBp = input.discountBp ?? 4500;
  if (!Number.isInteger(input.originalValuePaise) || input.originalValuePaise <= 0) {
    throw new Error("originalValuePaise must be positive");
  }
  if (!Number.isInteger(input.platformFlatFeePaise) || input.platformFlatFeePaise < 0) {
    throw new Error("platformFlatFeePaise cannot be negative");
  }
  if (!Number.isInteger(discountBp) || discountBp < 0 || discountBp > 10000) {
    throw new Error("discountBp must be between 0 and 10000");
  }
  const salePricePaise = Math.round((input.originalValuePaise * (10000 - discountBp)) / 10000);
  return {
    originalValuePaise: input.originalValuePaise,
    salePricePaise,
    discountPaise: input.originalValuePaise - salePricePaise,
    platformFeePaise: input.platformFlatFeePaise,
    merchantProceedsPaise: salePricePaise - input.platformFlatFeePaise,
    discountBp,
  };
}

export function canReserveSurplus(input: { quantityAvailable: number; requested?: number }): boolean {
  const requested = input.requested ?? 1;
  return (
    Number.isInteger(requested) &&
    requested > 0 &&
    Number.isInteger(input.quantityAvailable) &&
    input.quantityAvailable >= requested
  );
}

export function surplusRescueTitle(originalTitle: string): string {
  const title = originalTitle.trim() || "Chef's Surplus";
  return `${title} Rescue Bag`;
}
