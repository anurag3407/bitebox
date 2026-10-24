import { DomainError, LedgerEngine, buildBatchManifest, getSlotDeliveryQuote, sequenceDropPoints } from "@startup/core";
import { FaultCode } from "@startup/contracts";
import { getDbPool, withTransaction } from "../client.js";
import { LedgerRepository } from "./ledger.repository.js";
import { RefundRepository } from "./refund.repository.js";

export class BatchRepository {
  static async createCluster(input: {
    cityId: string;
    name: string;
    polygonGeojson: unknown;
    minProfitableDrops?: number;
  }) {
    const res = await getDbPool().query(
      `INSERT INTO clusters (city_id, name, polygon_geojson, min_profitable_drops)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.cityId, input.name, JSON.stringify(input.polygonGeojson), input.minProfitableDrops ?? 6]
    );
    return res.rows[0];
  }

  static async createDropPoint(input: {
    clusterId: string;
    name: string;
    latitude: number;
    longitude: number;
    microCaptainId?: string | null;
    captainFeePerBagPaise?: number;
  }) {
    const res = await getDbPool().query(
      `INSERT INTO drop_points (cluster_id, name, latitude, longitude, micro_captain_id, captain_fee_per_bag_paise)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        input.clusterId,
        input.name,
        input.latitude,
        input.longitude,
        input.microCaptainId ?? null,
        input.captainFeePerBagPaise ?? 300,
      ]
    );
    return res.rows[0];
  }

  static async listDropPoints(clusterId: string) {
    const res = await getDbPool().query(`SELECT * FROM drop_points WHERE cluster_id = $1 ORDER BY name`, [clusterId]);
    return res.rows;
  }

  static async findDropPoint(dropPointId: string) {
    const res = await getDbPool().query(
      `SELECT dp.*, c.min_profitable_drops FROM drop_points dp JOIN clusters c ON c.id = dp.cluster_id WHERE dp.id = $1`,
      [dropPointId]
    );
    return res.rows[0] ?? null;
  }

  static async quoteSlot(input: {
    dropPointId: string;
    slotWindow: string;
    isExpressPointToPoint?: boolean;
  }) {
    const drop = await BatchRepository.findDropPoint(input.dropPointId);
    if (!drop) throw new DomainError("NOT_FOUND", "Drop point not found");
    const countRes = await getDbPool().query(
      `SELECT COUNT(*)::int AS count FROM orders
        WHERE drop_point_id = $1 AND slot_window = $2 AND batch_id IS NULL
          AND payment_status <> 'PENDING'
          AND fulfillment_state NOT IN ('CANCELLED', 'DELIVERY_FAILED')`,
      [input.dropPointId, input.slotWindow]
    );
    return getSlotDeliveryQuote({
      currentOrders: countRes.rows[0]?.count ?? 0,
      targetOrders: drop.min_profitable_drops ?? 6,
      isExpressPointToPoint: input.isExpressPointToPoint,
    });
  }

  /**
   * Locks all paid orders for a cluster/slot into one batch, sequences gate
   * drops from the anchor kitchen and creates micro-captain handover rows.
   */
  static async lockBatch(input: {
    clusterId: string;
    slotWindow: string;
    slotStart: Date;
    slotEnd: Date;
    riderId?: string | null;
    riderTrunkCostPaise?: number;
  }) {
    return withTransaction(async (client) => {
      const orders = await client.query(
        `SELECT o.id, o.drop_point_id, o.order_type, o.breakdown_json,
                dp.name AS drop_name, dp.latitude, dp.longitude,
                dp.micro_captain_id, dp.captain_fee_per_bag_paise,
                r.latitude AS pickup_latitude, r.longitude AS pickup_longitude
           FROM orders o
           JOIN drop_points dp ON dp.id = o.drop_point_id
           JOIN clusters c ON c.id = dp.cluster_id
           JOIN restaurants r ON r.id = o.restaurant_id
          WHERE c.id = $1 AND o.slot_window = $2 AND o.batch_id IS NULL
            AND o.payment_status <> 'PENDING'
            AND o.fulfillment_state NOT IN ('CANCELLED', 'DELIVERY_FAILED', 'PENDING_PAYMENT')
          ORDER BY dp.name, o.created_at
          FOR UPDATE OF o`,
        [input.clusterId, input.slotWindow]
      );
      if (orders.rows.length === 0) return null;

      const thresholdRes = await client.query(`SELECT min_profitable_drops FROM clusters WHERE id = $1`, [input.clusterId]);
      const minDrops = thresholdRes.rows[0]?.min_profitable_drops ?? 6;

      const batchRes = await client.query(
        `INSERT INTO dispatch_batches
           (cluster_id, slot_window, slot_start, slot_end, status, rider_id, rider_trunk_cost_paise)
         VALUES ($1, $2, $3, $4, 'LOCKED', $5, $6)
         ON CONFLICT (cluster_id, slot_window) DO UPDATE SET
           status = 'LOCKED', slot_start = EXCLUDED.slot_start, slot_end = EXCLUDED.slot_end,
           rider_id = COALESCE(EXCLUDED.rider_id, dispatch_batches.rider_id),
           rider_trunk_cost_paise = EXCLUDED.rider_trunk_cost_paise,
           locked_at = NOW(), updated_at = NOW()
         RETURNING *`,
        [
          input.clusterId,
          input.slotWindow,
          input.slotStart.toISOString(),
          input.slotEnd.toISOString(),
          input.riderId ?? null,
          input.riderTrunkCostPaise ?? 4000,
        ]
      );
      const batch = batchRes.rows[0];

      const byDrop = new Map<
        string,
        {
          id: string;
          name: string;
          latitude: number;
          longitude: number;
          microCaptainId: string | null;
          fee: number;
          bagCount: number;
          orderIds: string[];
        }
      >();
      for (const order of orders.rows) {
        const current = byDrop.get(order.drop_point_id) ?? {
          id: order.drop_point_id,
          name: order.drop_name,
          latitude: Number(order.latitude),
          longitude: Number(order.longitude),
          microCaptainId: order.micro_captain_id,
          fee: Number(order.captain_fee_per_bag_paise ?? 300),
          bagCount: 0,
          orderIds: [] as string[],
        };
        current.bagCount += 1;
        current.orderIds.push(order.id);
        byDrop.set(order.drop_point_id, current);
      }

      const pickup = {
        latitude: Number(orders.rows[0].pickup_latitude),
        longitude: Number(orders.rows[0].pickup_longitude),
      };
      const sequenced = sequenceDropPoints(pickup, [...byDrop.values()]);
      const sequenceByDrop = new Map(sequenced.map((drop) => [drop.id, drop.sequence]));

      for (const drop of byDrop.values()) {
        for (const orderId of drop.orderIds) {
          await client.query(
            `INSERT INTO batch_orders (batch_id, order_id, drop_point_id, sequence, bag_count)
             VALUES ($1, $2, $3, $4, 1)
             ON CONFLICT (order_id) DO NOTHING`,
            [batch.id, orderId, drop.id, sequenceByDrop.get(drop.id) ?? 1]
          );
          await client.query(`UPDATE orders SET batch_id = $2, updated_at = NOW() WHERE id = $1`, [orderId, batch.id]);
        }
        if (drop.microCaptainId) {
          await client.query(
            `INSERT INTO captain_handovers (batch_id, drop_point_id, captain_id, bag_count, amount_paise)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (batch_id, drop_point_id) DO NOTHING`,
            [batch.id, drop.id, drop.microCaptainId, drop.bagCount, drop.bagCount * drop.fee]
          );
        }
      }

      await client.query(`UPDATE dispatch_batches SET total_drops = $2, updated_at = NOW() WHERE id = $1`, [
        batch.id,
        byDrop.size,
      ]);

      // Density unlocked: refund the ₹15 slot fee to every paid order in the batch.
      if (orders.rows.length >= minDrops) {
        for (const order of orders.rows) {
          const fee = Number((order.breakdown_json as { deliveryFeePaise?: number } | null)?.deliveryFeePaise ?? 0);
          if (fee <= 0) continue;
          await RefundRepository.issueWithClient(client, {
            orderId: order.id,
            amountPaise: fee,
            reason: "Batch density unlocked: delivery fee waived",
            initiatedBy: "SYSTEM",
            faultCode: FaultCode.PLATFORM_GOODWILL,
          });
        }
      }

      const manifest = buildBatchManifest({
        batchId: batch.id,
        pickup,
        drops: [...byDrop.values()].map((drop) => ({
          id: drop.id,
          name: drop.name,
          latitude: drop.latitude,
          longitude: drop.longitude,
          bagCount: drop.bagCount,
        })),
        captainFeePerBagPaise: 300,
      });
      return { batch: { ...batch, total_drops: byDrop.size }, manifest, orders: orders.rows.length };
    });
  }

  static async creditCaptainHandover(input: { batchId: string; dropPointId: string }) {
    return withTransaction(async (client) => {
      const res = await client.query(
        `SELECT * FROM captain_handovers WHERE batch_id = $1 AND drop_point_id = $2 FOR UPDATE`,
        [input.batchId, input.dropPointId]
      );
      const handover = res.rows[0];
      if (!handover) throw new DomainError("NOT_FOUND", "Captain handover not found");
      if (handover.status === "PAID") return { amountPaise: handover.amount_paise, alreadyPaid: true };
      await client.query(`UPDATE captain_handovers SET status = 'PAID', paid_at = NOW() WHERE id = $1`, [handover.id]);
      await LedgerRepository.postTransactionWithClient(client, {
        effectType: "CAPTAIN",
        entries: LedgerEngine.buildCaptainHandoverEntries(
          handover.amount_paise,
          `handover:${handover.id}`
        ),
      });
      await client.query(
        `UPDATE dispatch_batches SET status = 'HANDED_TO_CAPTAIN', updated_at = NOW() WHERE id = $1`,
        [input.batchId]
      );
      return { amountPaise: handover.amount_paise, alreadyPaid: false };
    });
  }

  static async listBatches(clusterId: string) {
    const res = await getDbPool().query(
      `SELECT b.*, COUNT(bo.id)::int AS order_count
         FROM dispatch_batches b LEFT JOIN batch_orders bo ON bo.batch_id = b.id
        WHERE b.cluster_id = $1 GROUP BY b.id ORDER BY b.slot_start DESC LIMIT 50`,
      [clusterId]
    );
    return res.rows;
  }
}
