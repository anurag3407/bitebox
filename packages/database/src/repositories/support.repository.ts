import { SupportCategory } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { getDbPool, withTransaction } from "../client.js";
import { OutboxRepository } from "./outbox.repository.js";

export type TicketStatus = "OPEN" | "AWAITING_CUSTOMER" | "RESOLVED";

export interface SupportMessageRow {
  id: string;
  senderType: "CUSTOMER" | "AGENT" | "SYSTEM";
  senderName?: string;
  body: string;
  createdAt: string;
}

export interface SupportTicketRow {
  id: string;
  customerId: string;
  customerName: string;
  orderId?: string;
  orderNumber?: string;
  category: SupportCategory;
  status: TicketStatus;
  resolution?: string;
  lastMessageAt: string;
  createdAt: string;
  lastMessage?: string;
}

const CATEGORY_ACK: Record<string, string> = {
  MISSING_ITEM: "Sorry about the missing item. A support agent will review your order and reply here shortly.",
  WRONG_ITEM: "Sorry you received the wrong item. An agent will review this and reply here shortly.",
  QUALITY: "Sorry the food wasn't up to the mark. An agent will look into it and reply here shortly.",
  LATE_DELIVERY: "Sorry for the delay. An agent is checking with the delivery partner and will reply here shortly.",
  PAYMENT: "An agent will check the payment with our bank partner and reply here shortly.",
  CANCELLATION: "An agent will review your cancellation request and reply here shortly.",
  OTHER: "Thanks for reaching out. A support agent will reply here shortly.",
};

const TICKET_SELECT = `
  SELECT t.*, u.name AS customer_name, o.order_number,
         (SELECT body FROM support_messages m WHERE m.ticket_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_message
    FROM support_tickets t
    JOIN app_users u ON u.id = t.customer_id
    LEFT JOIN orders o ON o.id = t.order_id`;

function mapTicket(r: any): SupportTicketRow {
  return {
    id: r.id,
    customerId: r.customer_id,
    customerName: r.customer_name,
    orderId: r.order_id ?? undefined,
    orderNumber: r.order_number ?? undefined,
    category: r.category,
    status: r.status,
    resolution: r.resolution ?? undefined,
    lastMessageAt: (r.last_message_at as Date).toISOString(),
    createdAt: (r.created_at as Date).toISOString(),
    lastMessage: r.last_message ?? undefined,
  };
}

export class SupportRepository {
  /** Opens a ticket, or continues the open ticket for the same order. */
  static async open(customerId: string, input: { orderId?: string; category: SupportCategory; message: string }): Promise<string> {
    return withTransaction(async (client) => {
      if (input.orderId) {
        const order = await client.query(`SELECT customer_id FROM orders WHERE id = $1`, [input.orderId]);
        if (order.rows[0]?.customer_id !== customerId) throw new DomainError("NOT_FOUND", "Order not found");
        const existing = await client.query(
          `SELECT id FROM support_tickets WHERE order_id = $1 AND status <> 'RESOLVED' FOR UPDATE`,
          [input.orderId]
        );
        if (existing.rows[0]) {
          await SupportRepository.appendWithClient(client, existing.rows[0].id, "CUSTOMER", customerId, input.message);
          return existing.rows[0].id as string;
        }
      }
      const res = await client.query(
        `INSERT INTO support_tickets (customer_id, order_id, category) VALUES ($1, $2, $3) RETURNING id`,
        [customerId, input.orderId ?? null, input.category]
      );
      const ticketId: string = res.rows[0].id;
      await SupportRepository.appendWithClient(client, ticketId, "CUSTOMER", customerId, input.message);
      await SupportRepository.appendWithClient(client, ticketId, "SYSTEM", null, CATEGORY_ACK[input.category] ?? CATEGORY_ACK.OTHER!);
      await OutboxRepository.appendWithClient(client, "support.ticket_opened", ticketId, 0, {
        ticketId,
        customerId,
        orderId: input.orderId,
        category: input.category,
      });
      return ticketId;
    });
  }

  private static async appendWithClient(
    client: Parameters<typeof OutboxRepository.appendWithClient>[0],
    ticketId: string,
    senderType: "CUSTOMER" | "AGENT" | "SYSTEM",
    senderId: string | null,
    body: string
  ): Promise<void> {
    // clock_timestamp(), not NOW(): several messages written in one transaction must keep their order
    await client.query(`INSERT INTO support_messages (ticket_id, sender_type, sender_id, body, created_at) VALUES ($1, $2, $3, $4, clock_timestamp())`, [
      ticketId,
      senderType,
      senderId,
      body,
    ]);
    await client.query(`UPDATE support_tickets SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`, [ticketId]);
  }

  /** A customer reply reopens a resolved ticket; an agent reply waits on the customer and notifies them. */
  static async reply(input: { ticketId: string; senderType: "CUSTOMER" | "AGENT"; senderId: string; body: string }): Promise<void> {
    await withTransaction(async (client) => {
      const res = await client.query(`SELECT customer_id, status FROM support_tickets WHERE id = $1 FOR UPDATE`, [input.ticketId]);
      const ticket = res.rows[0];
      if (!ticket || (input.senderType === "CUSTOMER" && ticket.customer_id !== input.senderId)) {
        throw new DomainError("NOT_FOUND", "Conversation not found");
      }
      await SupportRepository.appendWithClient(client, input.ticketId, input.senderType, input.senderId, input.body);
      if (input.senderType === "CUSTOMER") {
        await client.query(`UPDATE support_tickets SET status = 'OPEN', resolved_at = NULL WHERE id = $1`, [input.ticketId]);
      } else {
        await client.query(
          `UPDATE support_tickets SET status = 'AWAITING_CUSTOMER', assigned_admin_id = COALESCE(assigned_admin_id, $2) WHERE id = $1`,
          [input.ticketId, input.senderId]
        );
        await OutboxRepository.appendWithClient(client, "support.agent_replied", input.ticketId, 0, {
          ticketId: input.ticketId,
          customerId: ticket.customer_id,
          preview: input.body.slice(0, 100),
        });
      }
    });
  }

  static async resolve(ticketId: string, adminId: string, resolution: string): Promise<void> {
    await withTransaction(async (client) => {
      const res = await client.query(
        `UPDATE support_tickets SET status = 'RESOLVED', resolution = $3, resolved_at = NOW(),
                assigned_admin_id = COALESCE(assigned_admin_id, $2), updated_at = NOW()
          WHERE id = $1 AND status <> 'RESOLVED' RETURNING customer_id`,
        [ticketId, adminId, resolution]
      );
      if (!res.rows[0]) throw new DomainError("STATE_CONFLICT", "Conversation is already resolved");
      await SupportRepository.appendWithClient(client, ticketId, "SYSTEM", null, `Marked resolved: ${resolution}`);
      await OutboxRepository.appendWithClient(client, "support.agent_replied", ticketId, 0, {
        ticketId,
        customerId: res.rows[0].customer_id,
        preview: `Resolved: ${resolution.slice(0, 80)}`,
      });
    });
  }

  static async getTicket(ticketId: string): Promise<{ ticket: SupportTicketRow; messages: SupportMessageRow[] } | null> {
    const res = await getDbPool().query(`${TICKET_SELECT} WHERE t.id = $1`, [ticketId]);
    if (!res.rows[0]) return null;
    const messages = await getDbPool().query(
      `SELECT m.id, m.sender_type, m.body, m.created_at, u.name AS sender_name
         FROM support_messages m LEFT JOIN app_users u ON u.id = m.sender_id
        WHERE m.ticket_id = $1 ORDER BY m.created_at, m.id`,
      [ticketId]
    );
    return {
      ticket: mapTicket(res.rows[0]),
      messages: messages.rows.map((m) => ({
        id: m.id,
        senderType: m.sender_type,
        // Customers see "Support" rather than an individual agent's name
        senderName: m.sender_type === "AGENT" ? (m.sender_name as string).split(" ")[0] : undefined,
        body: m.body,
        createdAt: (m.created_at as Date).toISOString(),
      })),
    };
  }

  static async listForCustomer(customerId: string): Promise<SupportTicketRow[]> {
    const res = await getDbPool().query(`${TICKET_SELECT} WHERE t.customer_id = $1 ORDER BY t.last_message_at DESC LIMIT 50`, [customerId]);
    return res.rows.map(mapTicket);
  }

  /** Agent queue: waiting-on-us first, oldest first. */
  static async listQueue(status?: TicketStatus): Promise<SupportTicketRow[]> {
    const res = await getDbPool().query(
      `${TICKET_SELECT} WHERE ($1::text IS NULL OR t.status = $1)
        ORDER BY (t.status = 'OPEN') DESC, t.last_message_at ASC LIMIT 200`,
      [status ?? null]
    );
    return res.rows.map(mapTicket);
  }
}
