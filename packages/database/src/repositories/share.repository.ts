import { createHash, randomBytes } from "node:crypto";
import { DomainError } from "@startup/core";
import { getDbPool, withTransaction } from "../client.js";
import { OutboxRepository } from "./outbox.repository.js";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class ShareRepository {
  static async createOrderLink(input: { orderId: string; customerId: string; hours?: number }) {
    return withTransaction(async (client) => {
      const order = await client.query(`SELECT customer_id FROM orders WHERE id = $1`, [input.orderId]);
      if (!order.rows[0] || order.rows[0].customer_id !== input.customerId) {
        throw new DomainError("NOT_FOUND", "Order not found");
      }
      const token = randomBytes(24).toString("base64url");
      const expiresAt = new Date(Date.now() + (input.hours ?? 24) * 60 * 60 * 1000);
      await client.query(
        `INSERT INTO order_share_links (order_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
        [input.orderId, hashToken(token), expiresAt]
      );
      await OutboxRepository.appendWithClient(client, "order.share_link_created", input.orderId, 1, {
        orderId: input.orderId,
        expiresAt: expiresAt.toISOString(),
      });
      return { token, expiresAt: expiresAt.toISOString() };
    });
  }

  static async resolveOrderId(token: string): Promise<string | null> {
    if (!token || token.length < 20) return null;
    const res = await getDbPool().query(
      `SELECT order_id FROM order_share_links
        WHERE token_hash = $1 AND expires_at > NOW() AND revoked_at IS NULL`,
      [hashToken(token)]
    );
    return res.rows[0]?.order_id ?? null;
  }
}
