import { DomainError } from "@startup/core";
import type { SafetyContact, SafetyEventType } from "@startup/contracts";
import { getDbPool, withTransaction } from "../client.js";
import { OutboxRepository } from "./outbox.repository.js";

export interface NotificationPreferencesPatch {
  orderUpdates?: boolean;
  offers?: boolean;
  referrals?: boolean;
  newsletter?: boolean;
  pushEnabled?: boolean;
  smsEnabled?: boolean;
  emailEnabled?: boolean;
  whatsappEnabled?: boolean;
}

export interface NotificationPreferencesRow {
  orderUpdates: boolean;
  offers: boolean;
  referrals: boolean;
  newsletter: boolean;
  pushEnabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  updatedAt: string;
}

export interface SafetyContactRow {
  id: string;
  name: string;
  phone: string;
  relationship?: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface SafetyEventRow {
  id: string;
  eventType: SafetyEventType;
  orderId?: string;
  status: string;
  note?: string;
  createdAt: string;
}

function mapPreferences(r: any): NotificationPreferencesRow {
  return {
    orderUpdates: r.order_updates,
    offers: r.offers,
    referrals: r.referrals,
    newsletter: r.newsletter,
    pushEnabled: r.push_enabled,
    smsEnabled: r.sms_enabled,
    emailEnabled: r.email_enabled,
    whatsappEnabled: r.whatsapp_enabled,
    updatedAt: (r.updated_at as Date).toISOString(),
  };
}

function mapContact(r: any): SafetyContactRow {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    relationship: r.relationship ?? undefined,
    isPrimary: r.is_primary,
    createdAt: (r.created_at as Date).toISOString(),
  };
}

export class PreferencesRepository {
  static async getNotifications(userId: string): Promise<NotificationPreferencesRow> {
    const res = await getDbPool().query(
      `INSERT INTO notification_preferences (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING *`,
      [userId]
    );
    return mapPreferences(res.rows[0]);
  }

  static async updateNotifications(userId: string, patch: NotificationPreferencesPatch): Promise<NotificationPreferencesRow> {
    const current = await PreferencesRepository.getNotifications(userId);
    const merged = {
      orderUpdates: patch.orderUpdates ?? current.orderUpdates,
      offers: patch.offers ?? current.offers,
      referrals: patch.referrals ?? current.referrals,
      newsletter: patch.newsletter ?? current.newsletter,
      pushEnabled: patch.pushEnabled ?? current.pushEnabled,
      smsEnabled: patch.smsEnabled ?? current.smsEnabled,
      emailEnabled: patch.emailEnabled ?? current.emailEnabled,
      whatsappEnabled: patch.whatsappEnabled ?? current.whatsappEnabled,
    };
    const res = await getDbPool().query(
      `UPDATE notification_preferences SET
         order_updates = $2, offers = $3, referrals = $4, newsletter = $5,
         push_enabled = $6, sms_enabled = $7, email_enabled = $8, whatsapp_enabled = $9, updated_at = NOW()
       WHERE user_id = $1 RETURNING *`,
      [
        userId,
        merged.orderUpdates,
        merged.offers,
        merged.referrals,
        merged.newsletter,
        merged.pushEnabled,
        merged.smsEnabled,
        merged.emailEnabled,
        merged.whatsappEnabled,
      ]
    );
    return mapPreferences(res.rows[0]);
  }

  static async listContacts(userId: string): Promise<SafetyContactRow[]> {
    const res = await getDbPool().query(
      `SELECT * FROM safety_contacts WHERE user_id = $1 ORDER BY is_primary DESC, created_at`,
      [userId]
    );
    return res.rows.map(mapContact);
  }

  static async addContact(userId: string, input: SafetyContact): Promise<SafetyContactRow> {
    return withTransaction(async (client) => {
      const count = await client.query(`SELECT COUNT(*)::int AS count FROM safety_contacts WHERE user_id = $1`, [userId]);
      if (count.rows[0].count >= 3) throw new DomainError("CONFLICT", "You can add up to 3 trusted contacts.");
      if (input.isPrimary) {
        await client.query(`UPDATE safety_contacts SET is_primary = false WHERE user_id = $1`, [userId]);
      }
      const res = await client.query(
        `INSERT INTO safety_contacts (user_id, name, phone, relationship, is_primary)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [userId, input.name, input.phone, input.relationship ?? null, input.isPrimary]
      );
      return mapContact(res.rows[0]);
    });
  }

  static async removeContact(userId: string, contactId: string): Promise<void> {
    const res = await getDbPool().query(`DELETE FROM safety_contacts WHERE id = $1 AND user_id = $2 RETURNING id`, [
      contactId,
      userId,
    ]);
    if (!res.rows[0]) throw new DomainError("NOT_FOUND", "Trusted contact not found");
  }

  static async createSafetyEvent(
    userId: string,
    input: { eventType: SafetyEventType; orderId?: string; latitude?: number; longitude?: number; note?: string }
  ): Promise<SafetyEventRow> {
    return withTransaction(async (client) => {
      if (input.orderId) {
        const order = await client.query(`SELECT customer_id FROM orders WHERE id = $1`, [input.orderId]);
        if (!order.rows[0] || order.rows[0].customer_id !== userId) throw new DomainError("NOT_FOUND", "Order not found");
      }
      const res = await client.query(
        `INSERT INTO safety_events (user_id, order_id, event_type, latitude, longitude, note)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [userId, input.orderId ?? null, input.eventType, input.latitude ?? null, input.longitude ?? null, input.note ?? null]
      );
      const eventId = res.rows[0].id as string;

      if (input.eventType === "SOS") {
        // An SOS always opens a priority support conversation so ops can act immediately
        const ticket = await client.query(
          `INSERT INTO support_tickets (customer_id, order_id, category, status)
           VALUES ($1, $2, 'OTHER', 'OPEN') RETURNING id`,
          [userId, input.orderId ?? null]
        );
        await client.query(
          `INSERT INTO support_messages (ticket_id, sender_type, sender_id, body, created_at)
           VALUES ($1, 'SYSTEM', NULL, $2, clock_timestamp())`,
          [
            ticket.rows[0].id,
            `SOS raised${input.orderId ? ` for order ${input.orderId}` : ""}. Our safety team has been alerted and will contact you immediately. If you are in danger, call 112.`,
          ]
        );
        await client.query(`UPDATE safety_events SET note = COALESCE(note, '') || ' [ticket:' || $2 || ']' WHERE id = $1`, [
          eventId,
          ticket.rows[0].id,
        ]);
        await OutboxRepository.appendWithClient(client, "safety.sos", eventId, 1, {
          eventId,
          userId,
          orderId: input.orderId,
          latitude: input.latitude,
          longitude: input.longitude,
          ticketId: ticket.rows[0].id,
        });
      } else {
        await OutboxRepository.appendWithClient(client, "safety.event", eventId, 1, {
          eventId,
          userId,
          orderId: input.orderId,
          eventType: input.eventType,
        });
      }
      return {
        id: eventId,
        eventType: res.rows[0].event_type,
        orderId: res.rows[0].order_id ?? undefined,
        status: res.rows[0].status,
        note: res.rows[0].note ?? undefined,
        createdAt: (res.rows[0].created_at as Date).toISOString(),
      };
    });
  }

  static async listSafetyEvents(userId: string): Promise<SafetyEventRow[]> {
    const res = await getDbPool().query(
      `SELECT * FROM safety_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [userId]
    );
    return res.rows.map((r) => ({
      id: r.id,
      eventType: r.event_type,
      orderId: r.order_id ?? undefined,
      status: r.status,
      note: r.note ?? undefined,
      createdAt: (r.created_at as Date).toISOString(),
    }));
  }
}
