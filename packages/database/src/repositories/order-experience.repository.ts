import type { PoolClient } from "pg";
import {
  OrderIssueCategory,
  OrderIssueResolution,
  OrderIssueStatus,
  OrderMessageChannel,
  OrderMessageSender,
  PaymentMethod,
} from "@startup/contracts";
import { DomainError, IssueRemedyPolicy } from "@startup/core";
import { getDbPool, withTransaction } from "../client.js";
import { OutboxRepository } from "./outbox.repository.js";
import { RefundRepository } from "./refund.repository.js";
import { WalletRepository } from "./wallet.repository.js";

export interface OrderMessageRow {
  id: string;
  channel: OrderMessageChannel;
  senderType: OrderMessageSender;
  senderName?: string;
  body: string;
  readAt?: string;
  createdAt: string;
}

export interface OrderIssueRow {
  id: string;
  orderId: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  category: OrderIssueCategory;
  description?: string;
  itemsJson: string[];
  photosJson: string[];
  status: OrderIssueStatus;
  resolution?: OrderIssueResolution;
  refundAmountPaise: number;
  walletCreditPaise: number;
  couponCode?: string;
  supportTicketId?: string;
  adminNote?: string;
  resolvedAt?: string;
  createdAt: string;
}

function mapMessage(r: any): OrderMessageRow {
  return {
    id: r.id,
    channel: r.channel,
    senderType: r.sender_type,
    senderName: r.sender_name ?? undefined,
    body: r.body,
    readAt: (r.read_at as Date | null)?.toISOString(),
    createdAt: (r.created_at as Date).toISOString(),
  };
}

function mapIssue(r: any): OrderIssueRow {
  return {
    id: r.id,
    orderId: r.order_id,
    orderNumber: r.order_number,
    customerId: r.customer_id,
    customerName: r.customer_name,
    category: r.category,
    description: r.description ?? undefined,
    itemsJson: (r.items_json as string[] | null) ?? [],
    photosJson: (r.photos_json as string[] | null) ?? [],
    status: r.status,
    resolution: r.resolution ?? undefined,
    refundAmountPaise: r.refund_amount_paise,
    walletCreditPaise: r.wallet_credit_paise,
    couponCode: r.coupon_code ?? undefined,
    supportTicketId: r.support_ticket_id ?? undefined,
    adminNote: r.admin_note ?? undefined,
    resolvedAt: (r.resolved_at as Date | null)?.toISOString(),
    createdAt: (r.created_at as Date).toISOString(),
  };
}

const ISSUE_SELECT = `
  SELECT i.*, o.order_number, u.name AS customer_name
    FROM order_issues i
    JOIN orders o ON o.id = i.order_id
    JOIN app_users u ON u.id = i.customer_id`;

const ISSUE_TO_SUPPORT_CATEGORY: Record<string, string> = {
  MISSING_ITEM: "MISSING_ITEM",
  WRONG_ITEM: "WRONG_ITEM",
  COLD_FOOD: "QUALITY",
  QUALITY: "QUALITY",
  LATE_DELIVERY: "LATE_DELIVERY",
  SPILLED: "QUALITY",
  NOT_DELIVERED: "LATE_DELIVERY",
  OTHER: "OTHER",
};

export interface CreateIssueInput {
  category: OrderIssueCategory;
  description: string;
  itemIds: string[];
  photos: string[];
}

export class OrderExperienceRepository {
  // ---------------------------------------------------------------- chat
  static async listMessages(orderId: string, channel: OrderMessageChannel): Promise<OrderMessageRow[]> {
    const res = await getDbPool().query(
      `SELECT m.*, u.name AS sender_name
         FROM order_messages m LEFT JOIN app_users u ON u.id = m.sender_user_id
        WHERE m.order_id = $1 AND m.channel = $2
        ORDER BY m.created_at, m.id`,
      [orderId, channel]
    );
    return res.rows.map(mapMessage);
  }

  static async sendMessage(input: {
    orderId: string;
    channel: OrderMessageChannel;
    senderType: OrderMessageSender;
    senderUserId: string;
    body: string;
  }): Promise<OrderMessageRow> {
    const res = await getDbPool().query(
      `INSERT INTO order_messages (order_id, channel, sender_type, sender_user_id, body)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [input.orderId, input.channel, input.senderType, input.senderUserId, input.body]
    );
    await OutboxRepository.appendWithClient(getDbPool(), "order.message_sent", input.orderId, 1, {
      orderId: input.orderId,
      channel: input.channel,
      senderType: input.senderType,
      preview: input.body.slice(0, 120),
    });
    return { ...mapMessage(res.rows[0]), senderName: undefined };
  }

  static async markMessagesRead(orderId: string, channel: OrderMessageChannel, readerType: OrderMessageSender) {
    await getDbPool().query(
      `UPDATE order_messages SET read_at = NOW()
        WHERE order_id = $1 AND channel = $2 AND sender_type <> $3 AND read_at IS NULL`,
      [orderId, channel, readerType]
    );
  }

  // ------------------------------------------------- delivery proof / PIN
  static async saveProof(input: {
    orderId: string;
    riderId: string;
    photoUrl?: string;
    latitude?: number;
    longitude?: number;
    note?: string;
  }) {
    return withTransaction(async (client) => {
      const order = await client.query(
        `SELECT o.id, o.contactless, o.fulfillment_state, da.id AS assignment_id, da.status AS trip_status
           FROM orders o
           JOIN delivery_assignments da ON da.order_id = o.id AND da.rider_id = $2
          WHERE o.id = $1
          ORDER BY da.assigned_at DESC LIMIT 1
          FOR UPDATE OF o`,
        [input.orderId, input.riderId]
      );
      const row = order.rows[0];
      if (!row) throw new DomainError("NOT_FOUND", "Active delivery not found");
      if (!["ASSIGNED", "AT_PICKUP", "PICKED_UP", "AT_DROPOFF"].includes(row.trip_status)) {
        throw new DomainError("STATE_CONFLICT", "This delivery is no longer active.");
      }
      if (row.contactless && !input.photoUrl) {
        throw new DomainError("VALIDATION_ERROR", "A doorstep photo is required for contactless deliveries.");
      }
      const res = await client.query(
        `INSERT INTO delivery_proofs (order_id, assignment_id, rider_id, photo_url, latitude, longitude, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (order_id) DO UPDATE SET
           photo_url = COALESCE(EXCLUDED.photo_url, delivery_proofs.photo_url),
           latitude = COALESCE(EXCLUDED.latitude, delivery_proofs.latitude),
           longitude = COALESCE(EXCLUDED.longitude, delivery_proofs.longitude),
           note = COALESCE(EXCLUDED.note, delivery_proofs.note)
         RETURNING *`,
        [
          input.orderId,
          row.assignment_id,
          input.riderId,
          input.photoUrl ?? null,
          input.latitude ?? null,
          input.longitude ?? null,
          input.note ?? null,
        ]
      );
      await client.query(
        `UPDATE orders SET delivery_proof_url = COALESCE($2, delivery_proof_url),
                delivered_latitude = COALESCE($3, delivered_latitude),
                delivered_longitude = COALESCE($4, delivered_longitude), updated_at = NOW()
          WHERE id = $1`,
        [input.orderId, input.photoUrl ?? null, input.latitude ?? null, input.longitude ?? null]
      );
      return {
        id: res.rows[0].id as string,
        orderId: input.orderId,
        photoUrl: res.rows[0].photo_url ?? undefined,
        latitude: res.rows[0].latitude ?? undefined,
        longitude: res.rows[0].longitude ?? undefined,
        note: res.rows[0].note ?? undefined,
        createdAt: (res.rows[0].created_at as Date).toISOString(),
      };
    });
  }

  static async getProof(orderId: string) {
    const res = await getDbPool().query(`SELECT * FROM delivery_proofs WHERE order_id = $1`, [orderId]);
    const r = res.rows[0];
    return r
      ? {
          id: r.id as string,
          photoUrl: r.photo_url ?? undefined,
          latitude: r.latitude ?? undefined,
          longitude: r.longitude ?? undefined,
          note: r.note ?? undefined,
          createdAt: (r.created_at as Date).toISOString(),
        }
      : null;
  }

  // --------------------------------------------------------------- issues
  static async createIssue(customerId: string, orderId: string, input: CreateIssueInput): Promise<OrderIssueRow> {
    return withTransaction(async (client) => {
      const orderRes = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
      const order = orderRes.rows[0];
      if (!order || order.customer_id !== customerId) throw new DomainError("NOT_FOUND", "Order not found");
      if (order.fulfillment_state !== "DELIVERED" && input.category !== "NOT_DELIVERED") {
        throw new DomainError("STATE_CONFLICT", "You can report a problem after the order is delivered.");
      }
      if (order.delivered_at && Date.now() - (order.delivered_at as Date).getTime() > 48 * 60 * 60 * 1000) {
        throw new DomainError("STATE_CONFLICT", "Problem reports are open for 48 hours after delivery.");
      }
      const existing = await client.query(`SELECT 1 FROM order_issues WHERE order_id = $1`, [orderId]);
      if (existing.rows.length > 0) {
        throw new DomainError("CONFLICT", "A problem has already been reported for this order.");
      }

      const items = (order.items_json as Array<{ menuItemId: string; lineTotalPaise: number; name: string }>) ?? [];
      const selected = items.filter((i) => input.itemIds.includes(i.menuItemId));
      const selectedItemsPaise = selected.reduce((sum, i) => sum + i.lineTotalPaise, 0);
      const breakdown = order.breakdown_json as { subtotalPaise: number };
      const promised = order.promised_delivery_at as Date | null;
      const delivered = order.delivered_at as Date | null;
      const minutesLate =
        promised && delivered ? Math.max(0, Math.round((delivered.getTime() - promised.getTime()) / 60_000)) : undefined;

      const remedy = IssueRemedyPolicy.decide({
        category: input.category,
        orderDelivered: order.fulfillment_state === "DELIVERED",
        minutesLate,
        selectedItemsPaise,
        subtotalPaise: breakdown.subtotalPaise,
        hasItemSelection: selected.length > 0,
      });

      let supportTicketId: string | null = null;
      if (remedy.decision === "REVIEW") {
        const ticket = await client.query(
          `INSERT INTO support_tickets (customer_id, order_id, category, status)
           VALUES ($1, $2, $3, 'OPEN') RETURNING id`,
          [customerId, orderId, ISSUE_TO_SUPPORT_CATEGORY[input.category] ?? "OTHER"]
        );
        supportTicketId = ticket.rows[0].id;
        await client.query(
          `INSERT INTO support_messages (ticket_id, sender_type, sender_id, body, created_at)
           VALUES ($1, 'CUSTOMER', $2, $3, clock_timestamp())`,
          [supportTicketId, customerId, input.description]
        );
        await client.query(
          `INSERT INTO support_messages (ticket_id, sender_type, sender_id, body, created_at)
           VALUES ($1, 'SYSTEM', NULL, $2, clock_timestamp())`,
          [supportTicketId, remedy.reason]
        );
      }

      const autoResolved = remedy.decision === "AUTO_WALLET";
      const issueRes = await client.query(
        `INSERT INTO order_issues
           (order_id, customer_id, category, description, items_json, photos_json,
            status, resolution, wallet_credit_paise, support_ticket_id, resolved_at, admin_note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          orderId,
          customerId,
          input.category,
          input.description,
          JSON.stringify(input.itemIds),
          JSON.stringify(input.photos),
          autoResolved ? "RESOLVED" : "UNDER_REVIEW",
          autoResolved ? "WALLET_CREDIT" : null,
          autoResolved ? remedy.amountPaise : 0,
          supportTicketId,
          autoResolved ? new Date() : null,
          autoResolved ? `Instant resolution: ${remedy.reason}` : null,
        ]
      );
      const issueId = issueRes.rows[0].id as string;
      if (autoResolved) {
        await WalletRepository.postGoodwillCredit(client, {
          userId: customerId,
          orderId,
          issueId,
          amountPaise: remedy.amountPaise,
          description: `Order ${order.order_number}: ${remedy.reason}`,
        });
      }
      await OutboxRepository.appendWithClient(
        client,
        autoResolved ? "order.issue.resolved" : "order.issue.opened",
        issueId,
        1,
        {
          issueId,
          orderId,
          customerId,
          category: input.category,
          amountPaise: autoResolved ? remedy.amountPaise : 0,
          reason: remedy.reason,
        }
      );
      const row = await client.query(`${ISSUE_SELECT} WHERE i.id = $1`, [issueId]);
      return mapIssue(row.rows[0]);
    });
  }

  static async listForOrder(orderId: string): Promise<OrderIssueRow[]> {
    const res = await getDbPool().query(`${ISSUE_SELECT} WHERE i.order_id = $1 ORDER BY i.created_at DESC`, [orderId]);
    return res.rows.map(mapIssue);
  }

  static async listForCustomer(customerId: string): Promise<OrderIssueRow[]> {
    const res = await getDbPool().query(
      `${ISSUE_SELECT} WHERE i.customer_id = $1 ORDER BY i.created_at DESC LIMIT 50`,
      [customerId]
    );
    return res.rows.map(mapIssue);
  }

  static async listQueue(status?: OrderIssueStatus): Promise<OrderIssueRow[]> {
    const res = await getDbPool().query(
      `${ISSUE_SELECT}
        WHERE ($1::text IS NULL OR i.status = $1)
        ORDER BY (i.status = 'UNDER_REVIEW') DESC, i.created_at ASC LIMIT 200`,
      [status ?? null]
    );
    return res.rows.map(mapIssue);
  }

  /**
   * Admin resolution. Credits ride the wallet (instant, auditable); gateway refunds go
   * through the normal refund pipeline. Every outcome notifies the customer.
   */
  static async resolveIssue(
    issueId: string,
    adminId: string,
    input: {
      resolution: OrderIssueResolution;
      walletCreditPaise?: number;
      refundAmountPaise?: number;
      couponCode?: string;
      note: string;
    }
  ): Promise<OrderIssueRow> {
    return withTransaction(async (client) => {
      const issueRes = await client.query(`${ISSUE_SELECT} WHERE i.id = $1 FOR UPDATE`, [issueId]);
      const issue = issueRes.rows[0];
      if (!issue) throw new DomainError("NOT_FOUND", "Problem report not found");
      if (issue.status === "RESOLVED" || issue.status === "REJECTED") {
        throw new DomainError("STATE_CONFLICT", "This problem report is already closed.");
      }
      const orderRes = await client.query(
        `SELECT id, payment_method, payment_status, payable_paise, refunded_paise FROM orders WHERE id = $1 FOR UPDATE`,
        [issue.order_id]
      );
      const order = orderRes.rows[0];
      let walletCredit = 0;
      let refundAmount = 0;

      if (input.resolution === "WALLET_CREDIT") {
        walletCredit = input.walletCreditPaise ?? 0;
        if (walletCredit <= 0) throw new DomainError("VALIDATION_ERROR", "Enter a wallet credit amount");
        await WalletRepository.creditWithClient(client, {
          userId: issue.customer_id,
          kind: "GOODWILL",
          amountPaise: walletCredit,
          referenceType: "ORDER_ISSUE",
          referenceId: issueId,
          description: `Goodwill credit for order ${issue.order_number}`,
          orderId: issue.order_id,
        });
      } else if (input.resolution === "PARTIAL_REFUND" || input.resolution === "FULL_REFUND") {
        const refundable = Math.max(0, order.payable_paise - order.refunded_paise);
        refundAmount =
          input.resolution === "FULL_REFUND" ? refundable : Math.min(refundable, input.refundAmountPaise ?? 0);
        if (refundAmount <= 0) throw new DomainError("VALIDATION_ERROR", "Refund amount exceeds the refundable balance");
        if (order.payment_method === PaymentMethod.RAZORPAY && order.payment_status !== "PENDING") {
          await RefundRepository.issueWithClient(client, {
            orderId: issue.order_id,
            amountPaise: refundAmount,
            reason: `Order issue: ${issue.category}`,
            initiatedBy: `ADMIN:${adminId}`,
          });
        } else {
          await WalletRepository.creditWithClient(client, {
            userId: issue.customer_id,
            kind: "REFUND_CREDIT",
            amountPaise: refundAmount,
            referenceType: "REFUND",
            referenceId: `issue:${issueId}`,
            description: `Refund for order ${issue.order_number}`,
            orderId: issue.order_id,
          });
          await client.query(`UPDATE orders SET refunded_paise = refunded_paise + $2 WHERE id = $1`, [
            issue.order_id,
            refundAmount,
          ]);
        }
      } else if (input.resolution === "COUPON") {
        if (!input.couponCode) throw new DomainError("VALIDATION_ERROR", "Enter the coupon code to issue");
        // Goodwill coupons are single-use per customer and expire in 90 days
        await client.query(
          `INSERT INTO coupons (code, type, discount_value, min_order_paise, is_active, description, usage_limit_per_user, first_order_only, valid_until)
           VALUES ($1, 'FLAT', $2, 0, true, $3, 1, false, NOW() + interval '90 days')
           ON CONFLICT (code) DO NOTHING`,
          [
            input.couponCode.toUpperCase(),
            input.refundAmountPaise && input.refundAmountPaise > 0 ? input.refundAmountPaise : 10_000,
            `Goodwill from BiteBox support · order ${issue.order_number}`,
          ]
        );
      }

      const rejected = input.resolution === "NONE";
      await client.query(
        `UPDATE order_issues
            SET status = $2, resolution = $3, wallet_credit_paise = $4, refund_amount_paise = $5,
                coupon_code = $6, admin_note = $7, resolved_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [
          issueId,
          rejected ? "REJECTED" : "RESOLVED",
          input.resolution,
          walletCredit,
          refundAmount,
          input.couponCode ?? null,
          input.note,
        ]
      );
      if (issue.support_ticket_id) {
        await client.query(
          `INSERT INTO support_messages (ticket_id, sender_type, sender_id, body, created_at)
           VALUES ($1, 'AGENT', $2, $3, clock_timestamp())`,
          [
            issue.support_ticket_id,
            adminId,
            `${rejected ? "Closed" : "Resolved"}: ${input.note}${refundAmount ? ` Refund: ₹${(refundAmount / 100).toFixed(0)}.` : ""}${walletCredit ? ` Credits: ₹${(walletCredit / 100).toFixed(0)}.` : ""}`,
          ]
        );
        await client.query(
          `UPDATE support_tickets SET status = 'RESOLVED', resolution = $2, resolved_at = NOW(), updated_at = NOW()
            WHERE id = $1`,
          [issue.support_ticket_id, input.note]
        );
      }
      await OutboxRepository.appendWithClient(client, "order.issue.resolved", issueId, 2, {
        issueId,
        orderId: issue.order_id,
        customerId: issue.customer_id,
        resolution: input.resolution,
        refundAmountPaise: refundAmount,
        walletCreditPaise: walletCredit,
      });
      const row = await client.query(`${ISSUE_SELECT} WHERE i.id = $1`, [issueId]);
      return mapIssue(row.rows[0]);
    });
  }

  static async getIssue(issueId: string): Promise<OrderIssueRow | null> {
    const res = await getDbPool().query(`${ISSUE_SELECT} WHERE i.id = $1`, [issueId]);
    return res.rows[0] ? mapIssue(res.rows[0]) : null;
  }
}
