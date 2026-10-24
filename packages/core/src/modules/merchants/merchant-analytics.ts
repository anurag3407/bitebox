import { AcquisitionChannel } from "@startup/contracts";

export interface MerchantChannelMetric {
  channel: AcquisitionChannel;
  orders: number;
  gmvPaise: number;
  platformFeesPaise: number;
  merchantPayoutPaise: number;
  onTimeOrders: number;
  deliveredOrders: number;
  defectRefunds: number;
  refundedOrders: number;
}

export interface MerchantChannelBreakdown extends MerchantChannelMetric {
  gmvSharePercent: number;
}

export interface MerchantSavingsReport {
  startDate: string;
  endDate: string;
  totalOrders: number;
  totalGmvPaise: number;
  totalPlatformFeesPaise: number;
  totalMerchantPayoutPaise: number;
  effectiveTakeRatePercent: number;
  incumbentBenchmarkPaise: number;
  netRupeesSavedPaise: number;
  onTimeHandoverRatePercent: number;
  defectRefundRatePercent: number;
  reliabilityRebateEligible: boolean;
  reliabilityRebateBp: number;
  reliabilityRebatePaise: number;
  channels: MerchantChannelBreakdown[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function nonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number`);
  return value;
}

/**
 * "Zomato savings" proof: compare actual platform fees against a 30% incumbent
 * benchmark, then layer on the SLA/defect health used for the reliability rebate.
 */
export function buildMerchantSavingsReport(
  rows: MerchantChannelMetric[],
  input: {
    startDate: string;
    endDate: string;
    incumbentTakeRateBp?: number;
    reliabilityRebateBp?: number;
    defectThresholdPercent?: number;
    onTimeThresholdPercent?: number;
  }
): MerchantSavingsReport {
  const incumbentTakeRateBp = input.incumbentTakeRateBp ?? 3000;
  const reliabilityRebateBp = input.reliabilityRebateBp ?? 150;
  const defectThresholdPercent = input.defectThresholdPercent ?? 1;
  const onTimeThresholdPercent = input.onTimeThresholdPercent ?? 96;

  let totalOrders = 0;
  let totalGmvPaise = 0;
  let totalPlatformFeesPaise = 0;
  let totalMerchantPayoutPaise = 0;
  let onTimeOrders = 0;
  let deliveredOrders = 0;
  let defectRefunds = 0;

  for (const row of rows) {
    totalOrders += nonNegative(row.orders, "orders");
    totalGmvPaise += nonNegative(row.gmvPaise, "gmvPaise");
    totalPlatformFeesPaise += nonNegative(row.platformFeesPaise, "platformFeesPaise");
    totalMerchantPayoutPaise += nonNegative(row.merchantPayoutPaise, "merchantPayoutPaise");
    onTimeOrders += nonNegative(row.onTimeOrders, "onTimeOrders");
    deliveredOrders += nonNegative(row.deliveredOrders, "deliveredOrders");
    defectRefunds += nonNegative(row.defectRefunds, "defectRefunds");
  }

  const effectiveTakeRatePercent = totalGmvPaise === 0 ? 0 : round2((totalPlatformFeesPaise / totalGmvPaise) * 100);
  const incumbentBenchmarkPaise = Math.round((totalGmvPaise * incumbentTakeRateBp) / 10000);
  const onTimeHandoverRatePercent = deliveredOrders === 0 ? 0 : round2((onTimeOrders / deliveredOrders) * 100);
  const defectRefundRatePercent = totalOrders === 0 ? 0 : round2((defectRefunds / totalOrders) * 100);
  const reliabilityRebateEligible =
    deliveredOrders > 0 && defectRefundRatePercent < defectThresholdPercent && onTimeHandoverRatePercent > onTimeThresholdPercent;

  return {
    startDate: input.startDate,
    endDate: input.endDate,
    totalOrders,
    totalGmvPaise,
    totalPlatformFeesPaise,
    totalMerchantPayoutPaise,
    effectiveTakeRatePercent,
    incumbentBenchmarkPaise,
    netRupeesSavedPaise: incumbentBenchmarkPaise - totalPlatformFeesPaise,
    onTimeHandoverRatePercent,
    defectRefundRatePercent,
    reliabilityRebateEligible,
    reliabilityRebateBp,
    reliabilityRebatePaise: reliabilityRebateEligible
      ? Math.round((totalPlatformFeesPaise * reliabilityRebateBp) / 10000)
      : 0,
    channels: rows.map((row) => ({
      ...row,
      gmvSharePercent: totalGmvPaise === 0 ? 0 : round2((row.gmvPaise / totalGmvPaise) * 100),
    })),
  };
}
