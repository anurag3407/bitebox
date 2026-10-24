import { AcquisitionChannel } from "@startup/contracts";
import { buildMerchantSavingsReport, type MerchantChannelMetric } from "@startup/core";
import { getDbPool } from "../client.js";

export class MerchantAnalyticsRepository {
  static async savingsReport(input: { restaurantId: string; startDate: Date; endDate: Date }) {
    const rows = await getDbPool().query(
      `SELECT o.acquisition_channel AS channel,
              COUNT(*)::int AS orders,
              COALESCE(SUM((o.breakdown_json->>'subtotalPaise')::int), 0)::int AS gmv_paise,
              COALESCE(SUM(o.commission_paise + o.merchant_order_fee_paise
                           + (o.breakdown_json->>'platformFeePaise')::int), 0)::int AS platform_fees_paise,
              COALESCE(SUM(o.merchant_net_payout_paise), 0)::int AS merchant_payout_paise,
              COUNT(*) FILTER (
                WHERE o.fulfillment_state = 'DELIVERED'
                  AND o.ready_at IS NOT NULL AND o.accepted_at IS NOT NULL
                  AND o.ready_at <= o.accepted_at + make_interval(mins => COALESCE(o.prep_time_minutes, 0) + 8)
              )::int AS on_time_orders,
              COUNT(*) FILTER (WHERE o.fulfillment_state = 'DELIVERED')::int AS delivered_orders,
              COUNT(*) FILTER (WHERE o.refunded_paise > 0)::int AS refunded_orders
         FROM orders o
        WHERE o.restaurant_id = $1 AND o.created_at >= $2 AND o.created_at < $3
          AND o.fulfillment_state NOT IN ('PENDING_PAYMENT', 'CANCELLED', 'DELIVERY_FAILED')
        GROUP BY o.acquisition_channel`,
      [input.restaurantId, input.startDate.toISOString(), input.endDate.toISOString()]
    );
    const defects = await getDbPool().query(
      `SELECT o.acquisition_channel AS channel, COUNT(*)::int AS defect_refunds
         FROM refunds rf JOIN orders o ON o.id = rf.order_id
        WHERE o.restaurant_id = $1 AND o.created_at >= $2 AND o.created_at < $3
          AND rf.status <> 'FAILED'
          AND rf.fault_code IN ('MERCHANT_QUALITY', 'MERCHANT_DELAY')
        GROUP BY o.acquisition_channel`,
      [input.restaurantId, input.startDate.toISOString(), input.endDate.toISOString()]
    );
    const defectsByChannel = new Map<string, number>(
      defects.rows.map((row) => [row.channel as string, row.defect_refunds as number])
    );
    const metrics: MerchantChannelMetric[] = rows.rows.map((row) => ({
      channel: row.channel as AcquisitionChannel,
      orders: row.orders,
      gmvPaise: row.gmv_paise,
      platformFeesPaise: row.platform_fees_paise,
      merchantPayoutPaise: row.merchant_payout_paise,
      onTimeOrders: row.on_time_orders,
      deliveredOrders: row.delivered_orders,
      defectRefunds: defectsByChannel.get(row.channel as string) ?? 0,
      refundedOrders: row.refunded_orders,
    }));
    return buildMerchantSavingsReport(metrics, {
      startDate: input.startDate.toISOString(),
      endDate: input.endDate.toISOString(),
    });
  }
}
