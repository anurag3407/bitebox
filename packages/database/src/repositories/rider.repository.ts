import { and, eq, inArray } from "drizzle-orm";
import type { PoolClient } from "pg";
import { Coordinate, DeliveryTripStatus, FulfillmentState } from "@startup/contracts";
import { DeliveryTripStateMachine, DispatchEngine, DomainError, safeEqual } from "@startup/core";
import { getDb, getDbPool, withTransaction } from "../client.js";
import { deliveryAssignments, riders } from "../schema/schema.js";
import { JobKind, JobRepository } from "./job.repository.js";
import { OrderRepository } from "./order.repository.js";
import { OutboxRepository } from "./outbox.repository.js";
import { ReferralRepository } from "./referral.repository.js";
import { LoyaltyRepository } from "./loyalty.repository.js";

type Queryable = Pick<PoolClient, "query">;

export const OFFER_TTL_SECONDS = 45;
export const MAX_DELIVERY_OTP_ATTEMPTS = 5;
// Riders must wait at the door this long before they may mark a delivery failed
export const MIN_WAIT_BEFORE_FAILED_DELIVERY_MS = 10 * 60 * 1000;
// Location rows are rewritten at most this often; Redis holds the high-frequency stream
const LOCATION_DB_WRITE_INTERVAL_SECONDS = 10;

// Orders a rider can be matched to (dispatch starts during preparation)
export const DISPATCHABLE_STATES: readonly FulfillmentState[] = [
  FulfillmentState.ACCEPTED,
  FulfillmentState.PREPARING,
  FulfillmentState.READY_FOR_PICKUP,
];

const ACTIVE_TRIP_STATUSES = DeliveryTripStateMachine.ACTIVE_STATUSES as DeliveryTripStatus[];

export type AdvanceTripResult =
  | { ok: true; status: DeliveryTripStatus; orderState: FulfillmentState }
  | { ok: false; reason: "INVALID_OTP"; attemptsRemaining: number };

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === "23505";
}

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

  /**
   * Going offline is refused mid-trip (the customer is waiting) and revokes any
   * pending offer so the order is re-dispatched immediately.
   */
  static async setOnlineStatus(riderId: string, isOnline: boolean): Promise<void> {
    await withTransaction(async (client) => {
      const res = await client.query(`SELECT is_approved, verification_status FROM riders WHERE id = $1 FOR UPDATE`, [riderId]);
      if (!res.rows[0]) throw new DomainError("NOT_FOUND", "Rider not found");
      if (isOnline && !res.rows[0].is_approved) {
        throw new DomainError("FORBIDDEN", "Your account is pending approval.");
      }
      if (isOnline && res.rows[0].verification_status !== "VERIFIED") {
        throw new DomainError("FORBIDDEN", "Complete your KYC verification before going online.");
      }
      if (!isOnline) {
        const active = await client.query(
          `SELECT 1 FROM delivery_assignments WHERE rider_id = $1 AND status = ANY($2::text[])`,
          [riderId, ACTIVE_TRIP_STATUSES]
        );
        if (active.rows.length > 0) {
          throw new DomainError("STATE_CONFLICT", "Finish your current delivery before going offline.");
        }
        const revoked = await client.query(
          `UPDATE delivery_offers SET status = 'REVOKED', responded_at = NOW(), response_reason = 'Rider went offline'
            WHERE rider_id = $1 AND status = 'OFFERED' RETURNING order_id`,
          [riderId]
        );
        for (const row of revoked.rows) {
          await RiderRepository.enqueueRedispatchWithClient(client, row.order_id);
        }
      }
      await client.query(`UPDATE riders SET is_online = $2 WHERE id = $1`, [riderId, isOnline]);
    });
  }

  static async updateLocation(
    riderId: string,
    latitude: number,
    longitude: number,
    headingDegrees?: number
  ): Promise<void> {
    await getDbPool().query(
      `UPDATE riders
          SET current_latitude = $2, current_longitude = $3, heading_degrees = $4, last_ping_at = NOW()
        WHERE id = $1
          AND (last_ping_at IS NULL OR last_ping_at < NOW() - make_interval(secs => $5))`,
      [riderId, latitude, longitude, headingDegrees ?? null, LOCATION_DB_WRITE_INTERVAL_SECONDS]
    );
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
      .where(and(eq(deliveryAssignments.riderId, riderId), inArray(deliveryAssignments.status, ACTIVE_TRIP_STATUSES)))
      .limit(1);

    return assignment ?? null;
  }

  static async getPendingOfferForRider(riderId: string) {
    const res = await getDbPool().query(
      `SELECT id, order_id, status, expires_at, created_at, distance_to_pickup_meters
         FROM delivery_offers
        WHERE rider_id = $1 AND status = 'OFFERED' AND expires_at > NOW()
        ORDER BY created_at DESC LIMIT 1`,
      [riderId]
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: r.id as string,
      orderId: r.order_id as string,
      status: r.status as string,
      expiresAt: (r.expires_at as Date).toISOString(),
      createdAt: (r.created_at as Date).toISOString(),
      distanceToPickupMeters: (r.distance_to_pickup_meters as number | null) ?? undefined,
    };
  }

  static async findOffer(offerId: string) {
    const res = await getDbPool().query(`SELECT id, order_id, rider_id, status FROM delivery_offers WHERE id = $1`, [offerId]);
    const r = res.rows[0];
    return r ? { id: r.id as string, orderId: r.order_id as string, riderId: r.rider_id as string, status: r.status as string } : null;
  }

  /**
   * Online, approved, fresh-pinged riders without an active trip near the pickup,
   * excluding riders who already passed on this order.
   */
  static async findDispatchCandidates(
    orderId: string,
    pickup: Coordinate,
    liveLocations: Map<string, Coordinate> = new Map()
  ) {
    const radius = DispatchEngine.MAX_PICKUP_DISTANCE_METERS;
    const latDelta = radius / 111_320;
    const lngDelta = radius / (111_320 * Math.max(0.1, Math.cos((pickup.latitude * Math.PI) / 180)));
    const res = await getDbPool().query(
      `SELECT r.id, r.name, r.current_latitude, r.current_longitude, r.last_ping_at
         FROM riders r
        WHERE r.is_online AND r.is_approved
          AND r.last_ping_at > NOW() - make_interval(secs => $7)
          AND r.current_latitude BETWEEN $1 AND $2
          AND r.current_longitude BETWEEN $3 AND $4
          AND NOT EXISTS (SELECT 1 FROM delivery_assignments da
                           WHERE da.rider_id = r.id AND da.status = ANY($5::text[]))
          AND NOT EXISTS (SELECT 1 FROM delivery_offers d
                           WHERE d.rider_id = r.id AND d.status = 'OFFERED' AND d.expires_at > NOW())
          AND NOT EXISTS (SELECT 1 FROM delivery_offers d
                           WHERE d.rider_id = r.id AND d.order_id = $6 AND d.status IN ('REJECTED', 'EXPIRED'))
        LIMIT 200`,
      [
        pickup.latitude - latDelta,
        pickup.latitude + latDelta,
        pickup.longitude - lngDelta,
        pickup.longitude + lngDelta,
        ACTIVE_TRIP_STATUSES,
        orderId,
        DispatchEngine.MAX_STALE_PING_AGE_MS / 1000,
      ]
    );

    return DispatchEngine.rankCandidates(
      res.rows.map((r) => ({
        riderId: r.id,
        name: r.name,
        isApproved: true,
        isOnline: true,
        hasActiveTrip: false,
        currentLocation: liveLocations.get(r.id) ?? { latitude: r.current_latitude, longitude: r.current_longitude },
        lastPingTimeMs: (r.last_ping_at as Date).getTime(),
      })),
      pickup
    );
  }

  /**
   * Creates a time-boxed offer if the order still needs a rider. Returns null when
   * the order was assigned, cancelled or already has a live offer in the meantime.
   */
  static async createOffer(input: {
    orderId: string;
    riderId: string;
    distanceToPickupMeters: number;
    ttlSeconds?: number;
  }): Promise<{ offerId: string; expiresAt: Date } | null> {
    try {
      return await withTransaction(async (client) => {
        const order = await OrderRepository.lockForUpdate(client, input.orderId);
        if (!DISPATCHABLE_STATES.includes(order.fulfillment_state)) return null;
        const busy = await client.query(
          `SELECT 1 FROM delivery_assignments WHERE order_id = $1 AND status = ANY($2::text[])
           UNION ALL
           SELECT 1 FROM delivery_offers WHERE order_id = $1 AND status = 'OFFERED' AND expires_at > NOW()`,
          [input.orderId, ACTIVE_TRIP_STATUSES]
        );
        if (busy.rows.length > 0) return null;
        // A previous offer may have lapsed without its timeout job having run yet
        await client.query(
          `UPDATE delivery_offers SET status = 'EXPIRED' WHERE order_id = $1 AND status = 'OFFERED'`,
          [input.orderId]
        );

        const expiresAt = new Date(Date.now() + (input.ttlSeconds ?? OFFER_TTL_SECONDS) * 1000);
        const res = await client.query(
          `INSERT INTO delivery_offers (id, order_id, rider_id, status, expires_at, distance_to_pickup_meters)
           VALUES (gen_random_uuid(), $1, $2, 'OFFERED', $3, $4) RETURNING id`,
          [input.orderId, input.riderId, expiresAt.toISOString(), input.distanceToPickupMeters]
        );
        const offerId: string = res.rows[0].id;
        await JobRepository.enqueueWithClient(client, JobKind.DISPATCH_OFFER_TIMEOUT, { offerId, orderId: input.orderId }, {
          runAt: new Date(expiresAt.getTime() + 1000),
          dedupeKey: `offer-timeout:${offerId}`,
        });
        await OutboxRepository.appendWithClient(client, "dispatch.offer_created", input.orderId, order.version, {
          orderId: input.orderId,
          offerId,
          riderId: input.riderId,
          expiresAt: expiresAt.toISOString(),
        });
        return { offerId, expiresAt };
      });
    } catch (err) {
      // Lost a race with another dispatcher for the same order or rider
      if (isUniqueViolation(err)) return null;
      throw err;
    }
  }

  static async enqueueRedispatchWithClient(client: Queryable, orderId: string, delayMs = 0): Promise<void> {
    await JobRepository.enqueueWithClient(client, JobKind.DISPATCH_ORDER, { orderId, attempt: 0 }, {
      runAt: new Date(Date.now() + delayMs),
      dedupeKey: `dispatch:${orderId}:redispatch:${Date.now()}`,
    });
  }

  static async acceptOfferAtomic(input: {
    offerId: string;
    orderId: string;
    riderId: string;
  }): Promise<{ assignmentId: string }> {
    try {
      return await withTransaction(async (client) => {
        const order = await OrderRepository.lockForUpdate(client, input.orderId);

        const offerRes = await client.query(
          `SELECT id, status, expires_at FROM delivery_offers
           WHERE id = $1 AND rider_id = $2 AND order_id = $3
           FOR UPDATE`,
          [input.offerId, input.riderId, input.orderId]
        );

        if (offerRes.rows.length === 0) {
          throw new DomainError("NOT_FOUND", "Delivery offer not found");
        }

        const offer = offerRes.rows[0];
        if (offer.status !== "OFFERED") {
          throw new DomainError("CONFLICT", `Offer is no longer available (current status: ${offer.status})`);
        }

        if (new Date(offer.expires_at).getTime() < Date.now()) {
          throw new DomainError("CONFLICT", "Offer has expired");
        }

        if (!DISPATCHABLE_STATES.includes(order.fulfillment_state)) {
          await client.query(`UPDATE delivery_offers SET status = 'REVOKED', responded_at = NOW() WHERE id = $1`, [
            input.offerId,
          ]);
          throw new DomainError("CONFLICT", "This order is no longer available for pickup");
        }

        const riderState = await client.query(`SELECT is_online, is_approved FROM riders WHERE id = $1 FOR UPDATE`, [
          input.riderId,
        ]);
        if (!riderState.rows[0]?.is_approved) throw new DomainError("FORBIDDEN", "Rider account is not approved");

        await client.query(`UPDATE delivery_offers SET status = 'ACCEPTED', responded_at = NOW() WHERE id = $1`, [
          input.offerId,
        ]);

        // The partial unique indexes enforce one active trip per rider and per order
        const assignRes = await client.query(
          `INSERT INTO delivery_assignments (id, order_id, rider_id, status, assigned_at)
           VALUES (gen_random_uuid(), $1, $2, 'ASSIGNED', NOW())
           RETURNING id`,
          [input.orderId, input.riderId]
        );
        const assignmentId: string = assignRes.rows[0].id;

        await OutboxRepository.appendWithClient(client, "order.assigned", input.orderId, order.version, {
          orderId: input.orderId,
          customerId: order.customer_id,
          restaurantId: order.restaurant_id,
          riderId: input.riderId,
          assignmentId,
        });

        return { assignmentId };
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new DomainError("CONFLICT", "Rider already has an active delivery or the order is already assigned");
      }
      throw err;
    }
  }

  static async rejectOffer(input: { offerId: string; riderId: string; reason?: string }): Promise<void> {
    await withTransaction(async (client) => {
      const res = await client.query(
        `UPDATE delivery_offers SET status = 'REJECTED', responded_at = NOW(), response_reason = $3
          WHERE id = $1 AND rider_id = $2 AND status = 'OFFERED'
          RETURNING order_id`,
        [input.offerId, input.riderId, input.reason ?? null]
      );
      if (res.rows.length === 0) throw new DomainError("CONFLICT", "Offer is no longer pending");
      await RiderRepository.enqueueRedispatchWithClient(client, res.rows[0].order_id);
    });
  }

  /** Offer timeout job: lapses the offer (if still pending) and looks for the next rider. */
  static async expireOffer(offerId: string): Promise<boolean> {
    return withTransaction(async (client) => {
      const res = await client.query(
        `UPDATE delivery_offers SET status = 'EXPIRED', responded_at = NOW()
          WHERE id = $1 AND status = 'OFFERED' AND expires_at <= NOW()
          RETURNING order_id`,
        [offerId]
      );
      if (res.rows.length === 0) return false;
      await RiderRepository.enqueueRedispatchWithClient(client, res.rows[0].order_id);
      return true;
    });
  }

  /**
   * Advances a trip milestone for the rider who owns it, keeping the order's
   * fulfillment state in lock-step. Delivery requires the customer's OTP; after
   * MAX_DELIVERY_OTP_ATTEMPTS wrong codes the trip is locked for support review.
   */
  static async advanceTrip(input: {
    assignmentId: string;
    riderId: string;
    nextStatus: DeliveryTripStatus;
    challengeCode?: string;
    failureReason?: string;
  }): Promise<AdvanceTripResult> {
    return withTransaction(async (client) => {
      const tripRes = await client.query(
        `SELECT id, order_id, status, otp_failed_attempts, arrived_dropoff_at, picked_up_at
           FROM delivery_assignments WHERE id = $1 AND rider_id = $2 FOR UPDATE`,
        [input.assignmentId, input.riderId]
      );
      const trip = tripRes.rows[0];
      if (!trip) throw new DomainError("NOT_FOUND", "Trip not found for this rider");

      const current = trip.status as DeliveryTripStatus;
      if (!DeliveryTripStateMachine.canTransition(current, input.nextStatus)) {
        throw new DomainError("STATE_CONFLICT", `Cannot move trip from ${current} to ${input.nextStatus}`, {
          details: { currentStatus: current },
        });
      }

      let order = await OrderRepository.lockForUpdate(client, trip.order_id);
      const actor = { actorType: "RIDER" as const, actorId: input.riderId };

      switch (input.nextStatus) {
        case DeliveryTripStatus.AT_PICKUP: {
          await client.query(`UPDATE delivery_assignments SET arrived_pickup_at = NOW() WHERE id = $1`, [trip.id]);
          await OutboxRepository.appendWithClient(client, "rider.arrived_pickup", order.id, order.version, {
            orderId: order.id,
            restaurantId: order.restaurant_id,
            riderId: input.riderId,
          });
          break;
        }

        case DeliveryTripStatus.PICKED_UP: {
          if (order.fulfillment_state !== FulfillmentState.READY_FOR_PICKUP) {
            // Food handed over before the kitchen tapped "ready": the store's pickup code proves the handover
            if (!DISPATCHABLE_STATES.includes(order.fulfillment_state)) {
              throw new DomainError("STATE_CONFLICT", "Order cannot be picked up in its current state", {
                details: { currentState: order.fulfillment_state },
              });
            }
            const codeRes = await client.query(`SELECT pickup_otp FROM orders WHERE id = $1`, [order.id]);
            if (!input.challengeCode || !safeEqual(input.challengeCode, codeRes.rows[0].pickup_otp)) {
              throw new DomainError(
                "VALIDATION_ERROR",
                "Food is not marked ready yet. Ask the restaurant for the pickup code to confirm handover."
              );
            }
            order = await OrderRepository.transitionLockedWithClient(client, order, {
              toState: FulfillmentState.READY_FOR_PICKUP,
              ...actor,
              reason: "Handed over to rider with pickup code",
            });
          }
          order = await OrderRepository.transitionLockedWithClient(client, order, {
            toState: FulfillmentState.PICKED_UP,
            ...actor,
            reason: "Rider picked up the order",
          });
          order = await OrderRepository.transitionLockedWithClient(client, order, {
            toState: FulfillmentState.OUT_FOR_DELIVERY,
            ...actor,
            reason: "Rider is on the way",
            extra: { riderId: input.riderId },
          });
          await client.query(`UPDATE delivery_assignments SET picked_up_at = NOW() WHERE id = $1`, [trip.id]);
          break;
        }

        case DeliveryTripStatus.AT_DROPOFF: {
          await client.query(`UPDATE delivery_assignments SET arrived_dropoff_at = NOW() WHERE id = $1`, [trip.id]);
          await OutboxRepository.appendWithClient(client, "rider.arrived_dropoff", order.id, order.version, {
            orderId: order.id,
            customerId: order.customer_id,
            riderId: input.riderId,
          });
          break;
        }

        case DeliveryTripStatus.COMPLETED: {
          if (order.contactless) {
            const proof = await client.query(`SELECT 1 FROM delivery_proofs WHERE order_id = $1`, [order.id]);
            if (proof.rows.length === 0) {
              throw new DomainError(
                "VALIDATION_ERROR",
                "This is a contactless delivery. Add a doorstep photo before completing it."
              );
            }
          }
          if (trip.otp_failed_attempts >= MAX_DELIVERY_OTP_ATTEMPTS) {
            throw new DomainError(
              "FORBIDDEN",
              "Too many incorrect OTP attempts. Contact support to complete this delivery."
            );
          }
          const codeRes = await client.query(`SELECT delivery_otp FROM orders WHERE id = $1`, [order.id]);
          if (!input.challengeCode || !safeEqual(input.challengeCode, codeRes.rows[0].delivery_otp)) {
            const attempts = trip.otp_failed_attempts + 1;
            await client.query(`UPDATE delivery_assignments SET otp_failed_attempts = $2 WHERE id = $1`, [
              trip.id,
              attempts,
            ]);
            if (attempts >= MAX_DELIVERY_OTP_ATTEMPTS) {
              await OutboxRepository.appendWithClient(client, "delivery.otp_locked", order.id, order.version, {
                orderId: order.id,
                riderId: input.riderId,
              });
            }
            // Commit the failed-attempt counter; do not throw (that would roll it back)
            return { ok: false, reason: "INVALID_OTP", attemptsRemaining: Math.max(0, MAX_DELIVERY_OTP_ATTEMPTS - attempts) };
          }
          if (order.fulfillment_state === FulfillmentState.PICKED_UP) {
            order = await OrderRepository.transitionLockedWithClient(client, order, {
              toState: FulfillmentState.OUT_FOR_DELIVERY,
              ...actor,
            });
          }
          order = await OrderRepository.transitionLockedWithClient(client, order, {
            toState: FulfillmentState.DELIVERED,
            ...actor,
            reason: "Delivered with customer OTP",
            extra: { riderId: input.riderId },
          });
          await client.query(`UPDATE delivery_assignments SET completed_at = NOW() WHERE id = $1`, [trip.id]);
          // COD is collected at the door before the delivery is closed
          await OrderRepository.recordCodCollectionWithClient(client, order);
          await client.query(`UPDATE riders SET delivery_count = delivery_count + 1 WHERE id = $1`, [input.riderId]);
          await ReferralRepository.qualifyWithClient(client, { refereeUserId: order.customer_id, orderId: order.id });
          await LoyaltyRepository.rewardDeliveryWithClient(client, {
            userId: order.customer_id,
            orderId: order.id,
            subtotalPaise: order.breakdown_json.subtotalPaise,
          });
          await JobRepository.enqueueWithClient(client, JobKind.ISSUE_INVOICE, { orderId: order.id }, { dedupeKey: `invoice:${order.id}` });
          break;
        }

        case DeliveryTripStatus.FAILED: {
          if (!input.failureReason) {
            throw new DomainError("VALIDATION_ERROR", "A reason is required to mark a delivery as failed");
          }
          const arrived = trip.arrived_dropoff_at as Date | null;
          if (!arrived || Date.now() - arrived.getTime() < MIN_WAIT_BEFORE_FAILED_DELIVERY_MS) {
            throw new DomainError(
              "STATE_CONFLICT",
              "Wait at the drop location for 10 minutes and try calling the customer before marking the delivery failed."
            );
          }
          if (order.fulfillment_state === FulfillmentState.PICKED_UP) {
            order = await OrderRepository.transitionLockedWithClient(client, order, {
              toState: FulfillmentState.OUT_FOR_DELIVERY,
              ...actor,
            });
          }
          order = await OrderRepository.transitionLockedWithClient(client, order, {
            toState: FulfillmentState.DELIVERY_FAILED,
            ...actor,
            reason: input.failureReason,
          });
          await client.query(`UPDATE delivery_assignments SET failure_reason = $2, completed_at = NOW() WHERE id = $1`, [
            trip.id,
            input.failureReason,
          ]);
          break;
        }

        default:
          throw new DomainError("VALIDATION_ERROR", `Unsupported trip status ${input.nextStatus}`);
      }

      await client.query(`UPDATE delivery_assignments SET status = $2 WHERE id = $1`, [trip.id, input.nextStatus]);
      return { ok: true, status: input.nextStatus, orderState: order.fulfillment_state };
    });
  }

  /** Admin override: assign a specific rider, bypassing the offer round. */
  static async assignManually(input: { orderId: string; riderId: string; adminId: string; reason: string }) {
    try {
      return await withTransaction(async (client) => {
        const order = await OrderRepository.lockForUpdate(client, input.orderId);
        if (order.order_mode === "PICKUP") {
          throw new DomainError("STATE_CONFLICT", "Pickup orders are collected by the customer and need no rider.");
        }
        if (!DISPATCHABLE_STATES.includes(order.fulfillment_state)) {
          throw new DomainError("STATE_CONFLICT", "Order is not awaiting a rider");
        }
        await client.query(
          `UPDATE delivery_offers SET status = 'REVOKED', responded_at = NOW(), response_reason = 'Manual assignment'
            WHERE order_id = $1 AND status = 'OFFERED'`,
          [input.orderId]
        );
        const res = await client.query(
          `INSERT INTO delivery_assignments (id, order_id, rider_id, status, assigned_at)
           VALUES (gen_random_uuid(), $1, $2, 'ASSIGNED', NOW()) RETURNING id`,
          [input.orderId, input.riderId]
        );
        await OutboxRepository.appendWithClient(client, "order.assigned", input.orderId, order.version, {
          orderId: input.orderId,
          customerId: order.customer_id,
          riderId: input.riderId,
          assignmentId: res.rows[0].id,
          manual: true,
          adminId: input.adminId,
          reason: input.reason,
        });
        return { assignmentId: res.rows[0].id as string };
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new DomainError("CONFLICT", "Rider is busy or the order is already assigned");
      throw err;
    }
  }

  /** Riders who stopped pinging are taken offline so dispatch does not wait on them. */
  static async markStaleRidersOffline(staleMinutes = 5): Promise<number> {
    const res = await getDbPool().query(
      `UPDATE riders r SET is_online = false
        WHERE r.is_online
          AND (r.last_ping_at IS NULL OR r.last_ping_at < NOW() - make_interval(mins => $1))
          AND NOT EXISTS (SELECT 1 FROM delivery_assignments da
                           WHERE da.rider_id = r.id AND da.status = ANY($2::text[]))`,
      [staleMinutes, ACTIVE_TRIP_STATUSES]
    );
    return res.rowCount ?? 0;
  }
}
