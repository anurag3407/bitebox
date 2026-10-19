import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { DeliveryOfferStatus, DeliveryTripStatus } from "@startup/contracts";
import { getDb, getDbPool } from "../client.js";
import {
  deliveryAssignments,
  deliveryOffers,
  orders,
  riders,
} from "../schema/schema.js";

export class RiderRepository {
  static async findById(riderId: string) {
    const db = getDb();
    const [rider] = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
    return rider ?? null;
  }

  static async findByUserId(userId: string) {
    const db = getDb();
    const [rider] = await db.select().from(riders).where(eq(riders.userId, userId)).limit(1);
    return rider ?? null;
  }

  static async setOnlineStatus(riderId: string, isOnline: boolean): Promise<void> {
    const db = getDb();
    await db.update(riders).set({ isOnline }).where(eq(riders.id, riderId));
  }

  static async updateLocation(
    riderId: string,
    latitude: number,
    longitude: number
  ): Promise<void> {
    const db = getDb();
    await db
      .update(riders)
      .set({
        currentLatitude: latitude,
        currentLongitude: longitude,
        lastPingAt: new Date(),
      })
      .where(eq(riders.id, riderId));
  }

  static async listOnlineRiders(): Promise<Array<typeof riders.$inferSelect>> {
    const db = getDb();
    return db
      .select()
      .from(riders)
      .where(and(eq(riders.isApproved, true), eq(riders.isOnline, true)));
  }

  static async getActiveTripForRider(riderId: string) {
    const db = getDb();
    const [assignment] = await db
      .select()
      .from(deliveryAssignments)
      .where(
        and(
          eq(deliveryAssignments.riderId, riderId),
          inArray(deliveryAssignments.status, [
            DeliveryTripStatus.ASSIGNED,
            DeliveryTripStatus.AT_PICKUP,
            DeliveryTripStatus.PICKED_UP,
            DeliveryTripStatus.AT_DROPOFF,
          ])
        )
      )
      .limit(1);

    return assignment ?? null;
  }

  static async acceptOfferAtomic(input: {
    offerId: string;
    orderId: string;
    riderId: string;
  }): Promise<{ assignmentId: string }> {
    const pool = getDbPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 1. Lock Rider offer for update
      const offerRes = await client.query(
        `SELECT id, status, expires_at FROM delivery_offers
         WHERE id = $1 AND rider_id = $2 AND order_id = $3
         FOR UPDATE`,
        [input.offerId, input.riderId, input.orderId]
      );

      if (offerRes.rows.length === 0) {
        throw new Error("Delivery offer not found");
      }

      const offer = offerRes.rows[0];
      if (offer.status !== "OFFERED") {
        throw new Error(`Offer is no longer available (current status: ${offer.status})`);
      }

      if (new Date(offer.expires_at).getTime() < Date.now()) {
        await client.query(
          `UPDATE delivery_offers SET status = 'EXPIRED' WHERE id = $1`,
          [input.offerId]
        );
        throw new Error("Offer has expired");
      }

      // 2. Ensure Rider does not have an active trip (single-order constraint)
      const riderTripRes = await client.query(
        `SELECT id FROM delivery_assignments
         WHERE rider_id = $1 AND status IN ('ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROPOFF')
         FOR UPDATE`,
        [input.riderId]
      );

      if (riderTripRes.rows.length > 0) {
        throw new Error("Rider already has an active delivery assignment");
      }

      // 3. Ensure Order does not already have an active assignment
      const orderTripRes = await client.query(
        `SELECT id FROM delivery_assignments
         WHERE order_id = $1 AND status IN ('ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROPOFF')
         FOR UPDATE`,
        [input.orderId]
      );

      if (orderTripRes.rows.length > 0) {
        throw new Error("Order is already assigned to another rider");
      }

      // 4. Update Offer to ACCEPTED
      await client.query(
        `UPDATE delivery_offers SET status = 'ACCEPTED' WHERE id = $1`,
        [input.offerId]
      );

      // 5. Create Delivery Assignment
      const assignRes = await client.query(
        `INSERT INTO delivery_assignments (id, order_id, rider_id, status, assigned_at)
         VALUES (gen_random_uuid(), $1, $2, 'ASSIGNED', NOW())
         RETURNING id`,
        [input.orderId, input.riderId]
      );
      const assignmentId = assignRes.rows[0].id;

      // 6. Outbox Event
      await client.query(
        `INSERT INTO outbox_events (id, event_type, aggregate_id, aggregate_version, payload_json, status)
         VALUES (gen_random_uuid(), 'order.assigned', $1, 4, $2, 'PENDING')`,
        [
          input.orderId,
          JSON.stringify({
            orderId: input.orderId,
            riderId: input.riderId,
            assignmentId,
          }),
        ]
      );

      await client.query("COMMIT");
      return { assignmentId };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  static async updateMilestone(input: {
    assignmentId: string;
    orderId: string;
    riderId: string;
    nextStatus: DeliveryTripStatus;
  }): Promise<void> {
    const db = getDb();
    const isCompleted = input.nextStatus === DeliveryTripStatus.COMPLETED;

    await db
      .update(deliveryAssignments)
      .set({
        status: input.nextStatus,
        completedAt: isCompleted ? new Date() : undefined,
      })
      .where(
        and(
          eq(deliveryAssignments.id, input.assignmentId),
          eq(deliveryAssignments.riderId, input.riderId)
        )
      );

    // If picked up, update order fulfillment state to PICKED_UP
    if (input.nextStatus === DeliveryTripStatus.PICKED_UP) {
      await db
        .update(orders)
        .set({ fulfillmentState: "PICKED_UP", updatedAt: new Date() })
        .where(eq(orders.id, input.orderId));
    }

    // If completed, update order fulfillment state to DELIVERED
    if (input.nextStatus === DeliveryTripStatus.COMPLETED) {
      await db
        .update(orders)
        .set({ fulfillmentState: "DELIVERED", updatedAt: new Date() })
        .where(eq(orders.id, input.orderId));
    }
  }
}
