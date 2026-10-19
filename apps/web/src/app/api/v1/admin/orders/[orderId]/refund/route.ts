import { NextRequest } from "next/server";
import { RefundRequestSchema } from "@startup/contracts";
import { LedgerRepository, getDbPool } from "@startup/database";
import { LedgerEngine } from "@startup/core";
import { apiError, apiSuccess } from "@/server/api-response";
import { getAuthenticatedActor } from "@/server/auth-guard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const actor = await getAuthenticatedActor(req);
    if (!actor || actor.role !== "ADMIN") {
      return apiError("FORBIDDEN", "Admin permission required to issue refunds", 403);
    }

    const { orderId } = await params;
    const body = await req.json();
    const parsed = RefundRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid refund request", 400, parsed.error.format());
    }

    const { amountPaise, reason } = parsed.data;

    const pool = getDbPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Lock Order row for update
      const orderRes = await client.query(
        `SELECT id, payable_paise, payment_status FROM orders WHERE id = $1 FOR UPDATE`,
        [orderId]
      );
      if (orderRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return apiError("NOT_FOUND", "Order not found", 404);
      }
      const order = orderRes.rows[0];

      // Calculate cumulative existing non-failed refunds under row lock
      const sumRes = await client.query(
        `SELECT COALESCE(SUM(amount_paise), 0) as total_refunded
         FROM refunds
         WHERE order_id = $1 AND status != 'FAILED'`,
        [orderId]
      );
      const totalRefunded = Number(sumRes.rows[0].total_refunded);
      const remainingRefundable = order.payable_paise - totalRefunded;

      if (amountPaise > remainingRefundable) {
        await client.query("ROLLBACK");
        return apiError(
          "VALIDATION_ERROR",
          `Refund of ₹${amountPaise / 100} exceeds remaining refundable balance (₹${remainingRefundable / 100} remaining of total ₹${order.payable_paise / 100})`,
          400
        );
      }

      // 1. Insert Refund row
      const refRes = await client.query(
        `INSERT INTO refunds (id, order_id, amount_paise, reason, status)
         VALUES (gen_random_uuid(), $1, $2, $3, 'PROCESSED')
         RETURNING id`,
        [orderId, amountPaise, reason]
      );
      const refundId = refRes.rows[0].id;

      // 2. Post balanced double-entry accounting ledger entries
      const entries = LedgerEngine.buildRefundEntries(amountPaise, reason);
      await LedgerRepository.postTransactionWithClient(client, {
        orderId,
        refundId,
        effectType: "REFUND",
        entries,
      });

      await client.query("COMMIT");

      return apiSuccess({
        success: true,
        refundId,
        amountPaise,
        remainingRefundablePaise: remainingRefundable - amountPaise,
        status: "PROCESSED",
      });
    } catch (err: any) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    return apiError("INTERNAL_ERROR", err.message || "Failed to process refund", 500);
  }
}
