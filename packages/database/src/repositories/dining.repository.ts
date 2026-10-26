import { randomInt } from "node:crypto";
import { DiningReservationStatus } from "@startup/contracts";
import { DomainError } from "@startup/core";
import type { DiningReservationRequest } from "@startup/contracts";
import { getDbPool, withTransaction } from "../client.js";
import { OutboxRepository } from "./outbox.repository.js";

export interface DiningRestaurantRow {
  id: string;
  slug: string;
  name: string;
  cuisines: string[];
  rating: number;
  ratingCount: number;
  avgPriceForOnePaise: number;
  heroImageUrl?: string;
  addressText: string;
  latitude: number;
  longitude: number;
  pureVeg: boolean;
  isOpen: boolean;
  acceptsReservations: boolean;
  reservationSlotMinutes: number;
  reservationCapacityPerSlot: number;
  maxPartySize: number;
  diningDescription?: string;
  distanceMeters?: number;
}

export interface DiningReservationRow {
  id: string;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  restaurantAddress: string;
  restaurantImageUrl?: string;
  customerId: string;
  customerName: string;
  date: string;
  slot: string;
  partySize: number;
  occasion?: string;
  specialRequest?: string;
  status: DiningReservationStatus;
  confirmationCode: string;
  createdAt: string;
  cancelledAt?: string;
}

export interface DiningSlot {
  slot: string;
  capacityLeft: number;
  isAvailable: boolean;
}

function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6_371_000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

function mapRestaurant(r: any, origin?: { latitude: number; longitude: number }): DiningRestaurantRow {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    cuisines: r.cuisines,
    rating: r.rating,
    ratingCount: r.rating_count,
    avgPriceForOnePaise: r.avg_price_for_one_paise,
    heroImageUrl: r.hero_image_url ?? undefined,
    addressText: r.address_text,
    latitude: r.latitude,
    longitude: r.longitude,
    pureVeg: r.pure_veg,
    isOpen: r.is_open,
    acceptsReservations: r.accepts_reservations,
    reservationSlotMinutes: r.reservation_slot_minutes,
    reservationCapacityPerSlot: r.reservation_capacity_per_slot,
    maxPartySize: r.max_party_size,
    diningDescription: r.dining_description ?? undefined,
    distanceMeters: origin ? distanceMeters(origin, { latitude: r.latitude, longitude: r.longitude }) : undefined,
  };
}

function mapReservation(r: any): DiningReservationRow {
  return {
    id: r.id,
    restaurantId: r.restaurant_id,
    restaurantName: r.restaurant_name,
    restaurantSlug: r.restaurant_slug,
    restaurantAddress: r.restaurant_address,
    restaurantImageUrl: r.restaurant_image_url ?? undefined,
    customerId: r.customer_id,
    customerName: r.customer_name,
    date: r.reservation_date instanceof Date ? r.reservation_date.toISOString().slice(0, 10) : String(r.reservation_date),
    slot: r.slot_time,
    partySize: r.party_size,
    occasion: r.occasion ?? undefined,
    specialRequest: r.special_request ?? undefined,
    status: r.status,
    confirmationCode: r.confirmation_code,
    createdAt: (r.created_at as Date).toISOString(),
    cancelledAt: (r.cancelled_at as Date | null)?.toISOString(),
  };
}

const RESERVATION_SELECT = `
  SELECT d.*, r.name AS restaurant_name, r.slug AS restaurant_slug,
         r.address_text AS restaurant_address, r.hero_image_url AS restaurant_image_url,
         u.name AS customer_name
    FROM dining_reservations d
    JOIN restaurants r ON r.id = d.restaurant_id
    JOIN app_users u ON u.id = d.customer_id`;

function slotTimes(intervalMinutes: number): string[] {
  const windows = [
    [12 * 60, 15 * 60],
    [19 * 60, 22 * 60 + 30],
  ];
  const out: string[] = [];
  for (const [start, end] of windows) {
    for (let m = start as number; m <= (end as number); m += intervalMinutes) {
      out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
    }
  }
  return out;
}

function slotDate(date: string, slot: string): Date {
  // Restaurants operate in IST; slots are authored in local time
  return new Date(`${date}T${slot}:00+05:30`);
}

function assertDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new DomainError("VALIDATION_ERROR", "Choose a valid date");
  const at = slotDate(date, "12:00");
  if (Number.isNaN(at.getTime())) throw new DomainError("VALIDATION_ERROR", "Choose a valid date");
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  today.setHours(0, 0, 0, 0);
  const requested = new Date(`${date}T00:00:00+05:30`);
  if (requested < today) throw new DomainError("VALIDATION_ERROR", "Choose a date in the future");
  if (requested.getTime() > Date.now() + 30 * 24 * 60 * 60 * 1000) {
    throw new DomainError("VALIDATION_ERROR", "Bookings open 30 days in advance");
  }
}

export class DiningRepository {
  static async listRestaurants(origin?: { latitude: number; longitude: number }, cuisine?: string): Promise<DiningRestaurantRow[]> {
    const res = await getDbPool().query(
      `SELECT * FROM restaurants
        WHERE is_active AND accepts_reservations
          AND ($1::text IS NULL OR $1 = ANY(cuisines))
        ORDER BY rating DESC, rating_count DESC LIMIT 60`,
      [cuisine ?? null]
    );
    return res.rows
      .map((r) => mapRestaurant(r, origin))
      .sort((a, b) => {
        if (a.distanceMeters !== undefined && b.distanceMeters !== undefined) return a.distanceMeters - b.distanceMeters;
        return b.rating - a.rating;
      });
  }

  static async getRestaurant(restaurantId: string): Promise<DiningRestaurantRow | null> {
    const res = await getDbPool().query(`SELECT * FROM restaurants WHERE id = $1 AND is_active`, [restaurantId]);
    return res.rows[0] ? mapRestaurant(res.rows[0]) : null;
  }

  static async getAvailability(restaurantId: string, date: string): Promise<{
    restaurant: DiningRestaurantRow;
    date: string;
    slots: DiningSlot[];
  }> {
    assertDate(date);
    const restaurant = await DiningRepository.getRestaurant(restaurantId);
    if (!restaurant) throw new DomainError("NOT_FOUND", "Restaurant not found");
    if (!restaurant.acceptsReservations) throw new DomainError("STATE_CONFLICT", "This restaurant does not take reservations.");

    const slots = slotTimes(restaurant.reservationSlotMinutes);
    const counts = await getDbPool().query(
      `SELECT slot_time, COUNT(*)::int AS booked FROM dining_reservations
        WHERE restaurant_id = $1 AND reservation_date = $2 AND status IN ('CONFIRMED', 'SEATED')
        GROUP BY slot_time`,
      [restaurantId, date]
    );
    const booked = new Map<string, number>(counts.rows.map((r) => [r.slot_time as string, r.booked as number]));
    const leadCutoff = Date.now() + 60 * 60 * 1000;
    return {
      restaurant,
      date,
      slots: slots.map((slot) => {
        const used = booked.get(slot) ?? 0;
        const left = Math.max(0, restaurant.reservationCapacityPerSlot - used);
        return {
          slot,
          capacityLeft: left,
          isAvailable: slotDate(date, slot).getTime() > leadCutoff && left > 0,
        };
      }),
    };
  }

  static async createReservation(customerId: string, input: DiningReservationRequest): Promise<DiningReservationRow> {
    assertDate(input.date);
    return withTransaction(async (client) => {
      const r = await client.query(`SELECT * FROM restaurants WHERE id = $1 FOR UPDATE`, [input.restaurantId]);
      const restaurant = r.rows[0];
      if (!restaurant || !restaurant.is_active) throw new DomainError("NOT_FOUND", "Restaurant not found");
      if (!restaurant.accepts_reservations) throw new DomainError("STATE_CONFLICT", "This restaurant does not take reservations.");
      if (input.partySize > restaurant.max_party_size) {
        throw new DomainError("VALIDATION_ERROR", `This restaurant accepts up to ${restaurant.max_party_size} guests per booking.`);
      }
      const validSlots = slotTimes(restaurant.reservation_slot_minutes);
      if (!validSlots.includes(input.slot)) throw new DomainError("VALIDATION_ERROR", "Choose an available time slot");
      if (slotDate(input.date, input.slot).getTime() < Date.now() + 60 * 60 * 1000) {
        throw new DomainError("VALIDATION_ERROR", "Choose a slot at least an hour from now");
      }
      const count = await client.query(
        `SELECT COUNT(*)::int AS booked FROM dining_reservations
          WHERE restaurant_id = $1 AND reservation_date = $2 AND slot_time = $3 AND status IN ('CONFIRMED', 'SEATED')`,
        [input.restaurantId, input.date, input.slot]
      );
      if (count.rows[0].booked >= restaurant.reservation_capacity_per_slot) {
        throw new DomainError("CONFLICT", "That slot just filled up. Please choose another time.");
      }
      const duplicate = await client.query(
        `SELECT 1 FROM dining_reservations
          WHERE restaurant_id = $1 AND customer_id = $2 AND reservation_date = $3 AND slot_time = $4
            AND status IN ('CONFIRMED', 'SEATED')`,
        [input.restaurantId, customerId, input.date, input.slot]
      );
      if (duplicate.rows.length > 0) throw new DomainError("CONFLICT", "You already have a booking at this time.");

      let code = "";
      for (let attempt = 0; attempt < 5 && !code; attempt++) {
        const candidate = `BB${randomInt(100000, 999999)}`;
        try {
          const insert = await client.query(
            `INSERT INTO dining_reservations
               (restaurant_id, customer_id, reservation_date, slot_time, party_size, occasion, special_request, confirmation_code)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [
              input.restaurantId,
              customerId,
              input.date,
              input.slot,
              input.partySize,
              input.occasion ?? null,
              input.specialRequest ?? null,
              candidate,
            ]
          );
          code = candidate;
          await OutboxRepository.appendWithClient(client, "dining.reservation_created", insert.rows[0].id, 1, {
            reservationId: insert.rows[0].id,
            restaurantId: input.restaurantId,
            customerId,
            date: input.date,
            slot: input.slot,
            partySize: input.partySize,
          });
          const row = await client.query(`${RESERVATION_SELECT} WHERE d.id = $1`, [insert.rows[0].id]);
          return mapReservation(row.rows[0]);
        } catch (err) {
          if ((err as { code?: string; constraint?: string }).code !== "23505") throw err;
        }
      }
      throw new DomainError("CONFLICT", "Could not confirm the booking. Please try again.");
    });
  }

  static async listForCustomer(customerId: string): Promise<DiningReservationRow[]> {
    const res = await getDbPool().query(
      `${RESERVATION_SELECT} WHERE d.customer_id = $1 ORDER BY d.reservation_date DESC, d.slot_time DESC LIMIT 50`,
      [customerId]
    );
    return res.rows.map(mapReservation);
  }

  static async cancel(customerId: string, reservationId: string): Promise<DiningReservationRow> {
    return withTransaction(async (client) => {
      const res = await client.query(
        `UPDATE dining_reservations
            SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND customer_id = $2 AND status = 'CONFIRMED'
          RETURNING id`,
        [reservationId, customerId]
      );
      if (!res.rows[0]) throw new DomainError("STATE_CONFLICT", "This booking can no longer be cancelled.");
      const row = await client.query(`${RESERVATION_SELECT} WHERE d.id = $1`, [reservationId]);
      return mapReservation(row.rows[0]);
    });
  }

  static async listForRestaurant(restaurantId: string, date?: string): Promise<DiningReservationRow[]> {
    const res = await getDbPool().query(
      `${RESERVATION_SELECT}
        WHERE d.restaurant_id = $1 AND ($2::date IS NULL OR d.reservation_date = $2::date)
        ORDER BY d.reservation_date, d.slot_time LIMIT 200`,
      [restaurantId, date ?? null]
    );
    return res.rows.map(mapReservation);
  }

  static async updateStatus(
    restaurantId: string,
    reservationId: string,
    status: DiningReservationStatus
  ): Promise<DiningReservationRow> {
    const allowed: Record<string, string[]> = {
      CONFIRMED: ["SEATED", "CANCELLED", "NO_SHOW"],
      SEATED: ["COMPLETED", "NO_SHOW"],
    };
    return withTransaction(async (client) => {
      const current = await client.query(
        `SELECT status FROM dining_reservations WHERE id = $1 AND restaurant_id = $2 FOR UPDATE`,
        [reservationId, restaurantId]
      );
      if (!current.rows[0]) throw new DomainError("NOT_FOUND", "Booking not found");
      const from = current.rows[0].status as string;
      if (!(allowed[from] ?? []).includes(status)) {
        throw new DomainError("STATE_CONFLICT", `Cannot move a ${from.toLowerCase()} booking to ${status.toLowerCase()}.`);
      }
      await client.query(`UPDATE dining_reservations SET status = $2, updated_at = NOW() WHERE id = $1`, [
        reservationId,
        status,
      ]);
      const row = await client.query(`${RESERVATION_SELECT} WHERE d.id = $1`, [reservationId]);
      return mapReservation(row.rows[0]);
    });
  }

  static async getReservation(reservationId: string): Promise<DiningReservationRow | null> {
    const res = await getDbPool().query(`${RESERVATION_SELECT} WHERE d.id = $1`, [reservationId]);
    return res.rows[0] ? mapReservation(res.rows[0]) : null;
  }
}
