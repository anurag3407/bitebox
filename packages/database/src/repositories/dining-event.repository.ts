import { randomBytes, randomUUID } from "node:crypto";
import { DomainError, LedgerAccountType } from "@startup/core";
import { WalletTransactionKind } from "@startup/contracts";
import { getDbPool, withTransaction } from "../client.js";
import { WalletRepository } from "./wallet.repository.js";

const MAX_TICKETS = 6;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export interface DiningEvent {
  id: string;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  title: string;
  description?: string;
  imageUrl?: string;
  category: "DINING" | "MUSIC" | "COMEDY" | "WORKSHOP";
  startsAt: string;
  endsAt: string;
  pricePaise: number;
  capacity: number;
  bookedCount: number;
  seatsLeft: number;
  venue: string;
  isActive: boolean;
}

export interface DiningEventBooking {
  id: string;
  eventId: string;
  eventTitle: string;
  restaurantName: string;
  restaurantSlug: string;
  imageUrl?: string;
  startsAt: string;
  venue: string;
  quantity: number;
  totalPaise: number;
  status: "CONFIRMED" | "CANCELLED";
  bookingCode: string;
  canCancel: boolean;
  createdAt: string;
}

function mapEvent(row: any): DiningEvent {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name,
    restaurantSlug: row.restaurant_slug,
    title: row.title,
    description: row.description ?? undefined,
    imageUrl: row.image_url ?? undefined,
    category: row.category,
    startsAt: (row.starts_at as Date).toISOString(),
    endsAt: (row.ends_at as Date).toISOString(),
    pricePaise: row.price_paise,
    capacity: row.capacity,
    bookedCount: row.booked_count,
    seatsLeft: Math.max(0, row.capacity - row.booked_count),
    venue: row.address_text ?? row.restaurant_name,
    isActive: row.is_active,
  };
}

function mapBooking(row: any): DiningEventBooking {
  return {
    id: row.id,
    eventId: row.event_id,
    eventTitle: row.title,
    restaurantName: row.restaurant_name,
    restaurantSlug: row.restaurant_slug,
    imageUrl: row.image_url ?? undefined,
    startsAt: (row.starts_at as Date).toISOString(),
    venue: row.address_text ?? row.restaurant_name,
    quantity: row.quantity,
    totalPaise: row.total_paise,
    status: row.status,
    bookingCode: row.booking_code,
    canCancel: row.status === "CONFIRMED" && new Date(row.starts_at).getTime() > Date.now() + 2 * 60 * 60 * 1000,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

function generateBookingCode(): string {
  const bytes = randomBytes(8);
  let code = "EV";
  for (const byte of bytes) code += CODE_ALPHABET.charAt(byte % CODE_ALPHABET.length);
  return code;
}

const BOOKING_SELECT = `SELECT b.*, e.title, e.image_url, e.starts_at, e.restaurant_id,
       r.name AS restaurant_name, r.slug AS restaurant_slug, r.address_text
  FROM dining_event_bookings b
  JOIN dining_events e ON e.id = b.event_id
  JOIN restaurants r ON r.id = e.restaurant_id`;

export class DiningEventRepository {
  static async listUpcoming(limit = 20): Promise<DiningEvent[]> {
    const res = await getDbPool().query(
      `SELECT e.*, r.name AS restaurant_name, r.slug AS restaurant_slug, r.address_text
         FROM dining_events e
         JOIN restaurants r ON r.id = e.restaurant_id
        WHERE e.is_active AND e.starts_at > NOW()
        ORDER BY e.starts_at ASC
        LIMIT $1`,
      [Math.min(50, Math.max(1, limit))]
    );
    return res.rows.map(mapEvent);
  }

  static async findById(eventId: string): Promise<DiningEvent | null> {
    const res = await getDbPool().query(
      `SELECT e.*, r.name AS restaurant_name, r.slug AS restaurant_slug, r.address_text
         FROM dining_events e
         JOIN restaurants r ON r.id = e.restaurant_id
        WHERE e.id = $1`,
      [eventId]
    );
    return res.rows[0] ? mapEvent(res.rows[0]) : null;
  }

  static async listBookings(userId: string): Promise<DiningEventBooking[]> {
    const res = await getDbPool().query(
      `${BOOKING_SELECT} WHERE b.user_id = $1 ORDER BY e.starts_at DESC`,
      [userId]
    );
    return res.rows.map(mapBooking);
  }

  static async book(input: { eventId: string; userId: string; quantity: number }): Promise<DiningEventBooking> {
    if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > MAX_TICKETS) {
      throw new DomainError("VALIDATION_ERROR", `Choose between 1 and ${MAX_TICKETS} tickets`);
    }
    return withTransaction(async (client) => {
      const eventRes = await client.query(
        `SELECT e.*, r.name AS restaurant_name, r.slug AS restaurant_slug, r.address_text
           FROM dining_events e
           JOIN restaurants r ON r.id = e.restaurant_id
          WHERE e.id = $1
          FOR UPDATE OF e`,
        [input.eventId]
      );
      const event = eventRes.rows[0];
      if (!event) throw new DomainError("NOT_FOUND", "Event not found");
      if (!event.is_active) throw new DomainError("STATE_CONFLICT", "This event is no longer available.");
      if (new Date(event.starts_at).getTime() < Date.now() + 15 * 60 * 1000) {
        throw new DomainError("STATE_CONFLICT", "Ticket sales have closed for this event.");
      }
      const seatsLeft = event.capacity - event.booked_count;
      if (seatsLeft < input.quantity) {
        throw new DomainError("STATE_CONFLICT", `Only ${seatsLeft} ${seatsLeft === 1 ? "seat is" : "seats are"} left for this event.`);
      }

      const totalPaise = event.price_paise * input.quantity;
      const bookingId = randomUUID();
      if (totalPaise > 0) {
        await WalletRepository.debitForPurchaseWithClient(client, {
          userId: input.userId,
          amountPaise: totalPaise,
          kind: WalletTransactionKind.EVENT_TICKET_PAYMENT,
          referenceType: "DINING_EVENT",
          referenceId: bookingId,
          description: `Tickets: ${event.title}`,
          counterAccount: LedgerAccountType.PLATFORM_REVENUE,
        });
      }

      let booking: any = null;
      for (let attempt = 0; attempt < 5 && !booking; attempt += 1) {
        try {
          const res = await client.query(
            `INSERT INTO dining_event_bookings (id, event_id, user_id, quantity, total_paise, booking_code)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [bookingId, event.id, input.userId, input.quantity, totalPaise, generateBookingCode()]
          );
          booking = res.rows[0];
        } catch (err) {
          if ((err as { code?: string }).code !== "23505" || attempt === 4) throw err;
        }
      }
      if (!booking) throw new DomainError("INTERNAL_ERROR", "Could not book tickets");
      await client.query(`UPDATE dining_events SET booked_count = booked_count + $2 WHERE id = $1`, [
        event.id,
        input.quantity,
      ]);
      const full = await client.query(`${BOOKING_SELECT} WHERE b.id = $1`, [booking.id]);
      return mapBooking(full.rows[0]);
    });
  }

  static async cancel(input: { bookingId: string; userId: string }): Promise<DiningEventBooking> {
    return withTransaction(async (client) => {
      const res = await client.query(
        `${BOOKING_SELECT} WHERE b.id = $1 FOR UPDATE OF b`,
        [input.bookingId]
      );
      const booking = res.rows[0];
      if (!booking || booking.user_id !== input.userId) throw new DomainError("NOT_FOUND", "Booking not found");
      if (booking.status === "CANCELLED") return mapBooking(booking);
      if (new Date(booking.starts_at).getTime() < Date.now() + 2 * 60 * 60 * 1000) {
        throw new DomainError("STATE_CONFLICT", "Cancellations close 2 hours before the event.");
      }

      await client.query(
        `UPDATE dining_event_bookings SET status = 'CANCELLED', cancelled_at = NOW() WHERE id = $1`,
        [booking.id]
      );
      await client.query(`UPDATE dining_events SET booked_count = GREATEST(0, booked_count - $2) WHERE id = $1`, [
        booking.event_id,
        booking.quantity,
      ]);
      if (booking.total_paise > 0) {
        await WalletRepository.creditWithClient(client, {
          userId: input.userId,
          kind: WalletTransactionKind.REFUND_CREDIT,
          amountPaise: booking.total_paise,
          referenceType: "DINING_EVENT_REFUND",
          referenceId: booking.id,
          description: `Refund: ${booking.title}`,
          counterAccount: LedgerAccountType.PLATFORM_REFUND_EXPENSE,
        });
      }
      const updated = await client.query(`${BOOKING_SELECT} WHERE b.id = $1`, [booking.id]);
      return mapBooking(updated.rows[0]);
    });
  }
}
