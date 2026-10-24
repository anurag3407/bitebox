export interface SamplingBounty {
  unitsToAttach: number;
  bountyPaise: number;
}

/** Attach only what is left in the campaign and what the order can carry. */
export function calculateSamplingBounty(input: {
  bountyPerBoxPaise: number;
  units: number;
  remainingUnits: number;
}): SamplingBounty {
  if (!Number.isInteger(input.units) || input.units < 0) throw new Error("units must be non-negative");
  if (!Number.isInteger(input.remainingUnits) || input.remainingUnits < 0) {
    throw new Error("remainingUnits must be non-negative");
  }
  if (!Number.isInteger(input.bountyPerBoxPaise) || input.bountyPerBoxPaise < 0) {
    throw new Error("bountyPerBoxPaise must be non-negative");
  }
  const unitsToAttach = Math.min(input.units, input.remainingUnits);
  return { unitsToAttach, bountyPaise: unitsToAttach * input.bountyPerBoxPaise };
}

export function shouldAttachSampling(input: {
  campaignClusterId: string;
  orderClusterId: string;
  active: boolean;
  remainingUnits: number;
  startsAt: Date;
  endsAt?: Date | null;
  now?: Date;
}): boolean {
  const now = (input.now ?? new Date()).getTime();
  return (
    input.active &&
    input.campaignClusterId === input.orderClusterId &&
    input.remainingUnits > 0 &&
    input.startsAt.getTime() <= now &&
    (!input.endsAt || input.endsAt.getTime() >= now)
  );
}

export function calculatePackagingIssuance(input: { quantity: number; unitCostPaise: number }): {
  quantity: number;
  unitCostPaise: number;
  totalCostPaise: number;
} {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error("quantity must be positive");
  if (!Number.isInteger(input.unitCostPaise) || input.unitCostPaise < 0) {
    throw new Error("unitCostPaise cannot be negative");
  }
  return { ...input, totalCostPaise: input.quantity * input.unitCostPaise };
}

export function buildSamplingInstruction(brandName: string, units = 1): string {
  return `INSERT ${units} ${brandName.trim().toUpperCase()} SAMPLE${units === 1 ? "" : "S"} IN EACH BOX`;
}
