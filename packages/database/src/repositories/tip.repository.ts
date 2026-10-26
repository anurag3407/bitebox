import { DomainError } from "@startup/core";
import { getDbPool, withTransaction } from "../client.js";
import { OutboxRepository } from "./outbox.repository.js";
import { WalletRepository } from "./wallet.repository.js";

export interface OrderTipRow {
  id: string;
  orderId: string;
  riderId: string;
  amountPaise: number;
  createdAt: string;
}

export class TipRepository {
  /** One tip per delivered order, paid from BiteBox Credits. */
  static async addTip(input: { orderId: string; customerId: string; amountPaise: number }): Promise<OrderTipRow> {
    return withTransaction(async (client) => {
      const orderRes = await client.query(
        `SELECT o.id, o.customer_id, o.fulfillment_state, o.delivered_at,
                da.rider_id
           FROM orders o
           LEFT JOIN LATERAL (
             SELECT rider_id FROM delivery_assignments
              WHERE order_id = o.id AND status = 'COMPLETED'
              ORDER BY completed_at DESC NULLS LAST LIMIT 1
           ) da ON true
          WHERE o.id = $1 FOR UPDATE OF o`,
        [input.orderId]
      );
      const order = orderRes.rows[0];
      if (!order || order.customer_id !== input.customerId) throw new DomainError("NOT_FOUND", "Order not found");
      if (order.fulfillment_state !== "DELIVERED") {
        throw new DomainError("STATE_CONFLICT", "You can tip once your order has been delivered.");
      }
      if (!order.rider_id) throw new DomainError("VALIDATION_ERROR", "This order was collected, so there is no delivery partner to tip.");
      const deliveredAt = order.delivered_at as Date | null;
      if (deliveredAt && Date.now() - deliveredAt.getTime() > 7 * 24 * 60 * 60 * 1000) {
        throw new DomainError("STATE_CONFLICT", "The tipping window for this order has closed.");
      }
      const existing = await client.query(`SELECT id FROM order_tips WHERE order_id = $1`, [input.orderId]);
      if (existing.rows[0]) throw new DomainError("CONFLICT", "You have already tipped this order.");

      const tipRes = await client.query(
        `INSERT INTO order_tips (order_id, customer_id, rider_id, amount_paise)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [input.orderId, input.customerId, order.rider_id, input.amountPaise]
      );
      const tip = tipRes.rows[0];
      await WalletRepository.payRiderTipWithClient(client, {
        userId: input.customerId,
        orderId: input.orderId,
        tipId: tip.id,
        amountPaise: input.amountPaise,
        description: "Tip for your delivery partner",
      });
      await OutboxRepository.appendWithClient(client, "order.tip_added", input.orderId, 1, {
        orderId: input.orderId,
        customerId: input.customerId,
        riderId: order.rider_id,
        amountPaise: input.amountPaise,
      });
      return {
        id: tip.id,
        orderId: tip.order_id,
        riderId: tip.rider_id,
        amountPaise: tip.amount_paise,
        createdAt: (tip.created_at as Date).toISOString(),
      };
    });
  }

  static async getForOrder(orderId: string): Promise<OrderTipRow | null> {
    const res = await getDbPool().query(`SELECT * FROM order_tips WHERE order_id = $1`, [orderId]);
    const r = res.rows[0];
    return r
      ? {
          id: r.id,
          orderId: r.order_id,
          riderId: r.rider_id,
          amountPaise: r.amount_paise,
          createdAt: (r.created_at as Date).toISOString(),
        }
      : null;
  }
}
