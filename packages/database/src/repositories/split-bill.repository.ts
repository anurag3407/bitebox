import { randomBytes } from "node:crypto";
import { DomainError, LedgerAccountType } from "@startup/core";
import { getDbPool, withTransaction } from "../client.js";
import { WalletRepository } from "./wallet.repository.js";

export interface SplitShare {
  id: string;
  shareIndex: number;
  amountPaise: number;
  status: "PENDING" | "PAID";
  payerId?: string;
  payerName?: string;
  paidAt?: string;
}

export interface BillSplit {
  id: string;
  orderId: string;
  orderNumber: string;
  restaurantName: string;
  hostId: string;
  hostName: string;
  token: string;
  parts: number;
  totalPaise: number;
  status: string;
  shares: SplitShare[];
  createdAt: string;
}

function mapShare(r: any): SplitShare {
  return {
    id: r.id,
    shareIndex: r.share_index,
    amountPaise: r.amount_paise,
    status: r.status,
    payerId: r.payer_id ?? undefined,
    payerName: r.payer_name ?? undefined,
    paidAt: r.paid_at ? (r.paid_at as Date).toISOString() : undefined,
  };
}

async function loadSplit(client: any, where: { token?: string; orderId?: string }): Promise<BillSplit | null> {
  const res = await client.query(
    `SELECT s.*, o.order_number, r.name AS restaurant_name, u.name AS host_name
       FROM order_splits s
       JOIN orders o ON o.id = s.order_id
       JOIN restaurants r ON r.id = o.restaurant_id
       JOIN app_users u ON u.id = s.host_id
      WHERE (${where.token ? "s.token = $1" : "s.order_id = $1"})
      LIMIT 1`,
    [where.token ?? where.orderId]
  );
  const split = res.rows[0];
  if (!split) return null;
  const shares = await client.query(
    `SELECT sh.*, u.name AS payer_name
       FROM order_split_shares sh LEFT JOIN app_users u ON u.id = sh.payer_id
      WHERE sh.split_id = $1 ORDER BY sh.share_index`,
    [split.id]
  );
  return {
    id: split.id,
    orderId: split.order_id,
    orderNumber: split.order_number,
    restaurantName: split.restaurant_name,
    hostId: split.host_id,
    hostName: split.host_name,
    token: split.token,
    parts: split.parts,
    totalPaise: split.total_paise,
    status: split.status,
    shares: shares.rows.map(mapShare),
    createdAt: (split.created_at as Date).toISOString(),
  };
}

export class SplitBillRepository {
  static async create(input: { orderId: string; hostId: string; parts: number }): Promise<BillSplit> {
    if (!Number.isInteger(input.parts) || input.parts < 2 || input.parts > 10) {
      throw new DomainError("VALIDATION_ERROR", "Split between 2 and 10 people");
    }
    return withTransaction(async (client) => {
      const orderRes = await client.query(
        `SELECT id, customer_id, payable_paise, fulfillment_state FROM orders WHERE id = $1 FOR UPDATE`,
        [input.orderId]
      );
      const order = orderRes.rows[0];
      if (!order || order.customer_id !== input.hostId) throw new DomainError("NOT_FOUND", "Order not found");
      if (order.fulfillment_state !== "DELIVERED") {
        throw new DomainError("STATE_CONFLICT", "You can split the bill after delivery");
      }
      if (order.payable_paise <= 0) throw new DomainError("VALIDATION_ERROR", "There is nothing to split");
      const existing = await client.query(`SELECT id FROM order_splits WHERE order_id = $1`, [order.id]);
      if (existing.rows[0]) throw new DomainError("STATE_CONFLICT", "This order already has a bill split");

      let split: any = null;
      for (let attempt = 0; attempt < 5 && !split; attempt += 1) {
        try {
          const res = await client.query(
            `INSERT INTO order_splits (order_id, host_id, token, parts, total_paise)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [order.id, input.hostId, randomBytes(18).toString("base64url"), input.parts, order.payable_paise]
          );
          split = res.rows[0];
        } catch (err) {
          if ((err as { code?: string }).code !== "23505" || attempt === 4) throw err;
        }
      }
      if (!split) throw new DomainError("INTERNAL_ERROR", "Could not create the split");
      const base = Math.floor(order.payable_paise / input.parts);
      const remainder = order.payable_paise - base * input.parts;
      for (let index = 1; index <= input.parts; index += 1) {
        const amount = base + (index <= remainder ? 1 : 0);
        await client.query(
          `INSERT INTO order_split_shares (split_id, share_index, amount_paise) VALUES ($1, $2, $3)`,
          [split.id, index, amount]
        );
      }
      return (await loadSplit(client, { orderId: order.id }))!;
    });
  }

  static async find(token: string): Promise<BillSplit | null> {
    return loadSplit(getDbPool(), { token });
  }

  static async forOrder(orderId: string, hostId: string): Promise<BillSplit | null> {
    const split = await loadSplit(getDbPool(), { orderId });
    if (!split) return null;
    const owner = await getDbPool().query(`SELECT 1 FROM order_splits WHERE order_id = $1 AND host_id = $2`, [
      orderId,
      hostId,
    ]);
    return owner.rows[0] ? split : null;
  }

  static async pay(input: { token: string; payerId: string }): Promise<{ split: BillSplit; paidShare: SplitShare }> {
    return withTransaction(async (client) => {
      const splitRes = await client.query(`SELECT * FROM order_splits WHERE token = $1 FOR UPDATE`, [input.token]);
      const split = splitRes.rows[0];
      if (!split) throw new DomainError("NOT_FOUND", "Split not found");
      if (split.status !== "OPEN") throw new DomainError("STATE_CONFLICT", "This bill is already settled");
      if (split.host_id === input.payerId) throw new DomainError("FORBIDDEN", "The host cannot pay a friend's share");
      const already = await client.query(
        `SELECT 1 FROM order_split_shares WHERE split_id = $1 AND payer_id = $2 AND status = 'PAID'`,
        [split.id, input.payerId]
      );
      if (already.rows[0]) throw new DomainError("STATE_CONFLICT", "You already paid a share of this bill");

      const shareRes = await client.query(
        `SELECT * FROM order_split_shares WHERE split_id = $1 AND status = 'PENDING'
          ORDER BY share_index LIMIT 1 FOR UPDATE`,
        [split.id]
      );
      const share = shareRes.rows[0];
      if (!share) throw new DomainError("STATE_CONFLICT", "There are no shares left to pay");

      await WalletRepository.debitForPurchaseWithClient(client, {
        userId: input.payerId,
        amountPaise: share.amount_paise,
        kind: "SPLIT_PAYMENT",
        referenceType: "SPLIT_SHARE",
        referenceId: share.id,
        description: `Split payment ${split.token}`,
        counterAccount: LedgerAccountType.WALLET_LIABILITY,
      });
      await WalletRepository.creditWithClient(client, {
        userId: split.host_id,
        kind: "SPLIT_RECEIVED",
        amountPaise: share.amount_paise,
        referenceType: "SPLIT_SHARE",
        referenceId: share.id,
        description: `Split received ${split.token}`,
        counterAccount: LedgerAccountType.WALLET_LIABILITY,
      });
      const paid = await client.query(
        `UPDATE order_split_shares SET status = 'PAID', payer_id = $2, paid_at = NOW()
          WHERE id = $1 RETURNING *`,
        [share.id, input.payerId]
      );
      const pending = await client.query(
        `SELECT COUNT(*)::int AS count FROM order_split_shares WHERE split_id = $1 AND status = 'PENDING'`,
        [split.id]
      );
      if (Number(pending.rows[0]?.count ?? 0) === 0) {
        await client.query(`UPDATE order_splits SET status = 'SETTLED' WHERE id = $1`, [split.id]);
      }
      const full = (await loadSplit(client, { token: split.token }))!;
      return { split: full, paidShare: mapShare(paid.rows[0]) };
    });
  }
}
