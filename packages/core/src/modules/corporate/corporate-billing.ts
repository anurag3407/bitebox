export interface CorporateSplit {
  orderTotalPaise: number;
  allowanceRemainingPaise: number;
  coveredPaise: number;
  overagePaise: number;
  managementFeePaise: number;
  corporateBilledPaise: number;
  employeePayablePaise: number;
}

/**
 * Company pays its subsidy share up to the employee's remaining daily allowance.
 * Any personal extras are charged to the employee via UPI, with no gateway cost
 * on the company-covered portion.
 */
export function calculateCorporateSplit(input: {
  orderTotalPaise: number;
  dailyAllowancePaise: number;
  subsidyBp: number;
  managementFeeBp: number;
  alreadyUsedPaise?: number;
}): CorporateSplit {
  for (const [name, value] of [
    ["orderTotalPaise", input.orderTotalPaise],
    ["dailyAllowancePaise", input.dailyAllowancePaise],
    ["subsidyBp", input.subsidyBp],
    ["managementFeeBp", input.managementFeeBp],
    ["alreadyUsedPaise", input.alreadyUsedPaise ?? 0],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  }
  if (input.subsidyBp > 10000 || input.managementFeeBp > 10000) throw new Error("Basis points cannot exceed 10000");

  const allowanceRemainingPaise = Math.max(0, input.dailyAllowancePaise - (input.alreadyUsedPaise ?? 0));
  const subsidyCapacity = Math.round((allowanceRemainingPaise * input.subsidyBp) / 10000);
  const coveredPaise = Math.min(input.orderTotalPaise, subsidyCapacity);
  const managementFeePaise = Math.round((coveredPaise * input.managementFeeBp) / 10000);
  return {
    orderTotalPaise: input.orderTotalPaise,
    allowanceRemainingPaise,
    coveredPaise,
    overagePaise: input.orderTotalPaise - coveredPaise,
    managementFeePaise,
    corporateBilledPaise: coveredPaise + managementFeePaise,
    employeePayablePaise: input.orderTotalPaise - coveredPaise,
  };
}

/** Weekday lunch in IST, regardless of the server timezone. */
export function isCorporateLunchSlot(now: Date, timezoneOffsetMinutes = 330): boolean {
  const local = new Date(now.getTime() + timezoneOffsetMinutes * 60 * 1000);
  const day = local.getUTCDay();
  const hour = local.getUTCHours();
  return day >= 1 && day <= 5 && hour >= 11 && hour < 15;
}

export function corporateBillingMonth(now: Date, timezoneOffsetMinutes = 330): string {
  const local = new Date(now.getTime() + timezoneOffsetMinutes * 60 * 1000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
}
