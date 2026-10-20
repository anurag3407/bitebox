import { CreateOrderRatingRequest, FulfillmentState, RestaurantReviewDto } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { getDbPool, withTransaction } from "../client.js";
import { OutboxRepository } from "./outbox.repository.js";

export class RatingRepository {
  static readonly RATING_WINDOW_DAYS = 7;

  /** One rating per delivered order, by its customer, within the rating window. */
  static async rateOrder(input: { orderId: string; customerId: string } & CreateOrderRatingRequest): Promise<void> {
    await withTransaction(async (client) => {
      const res = await client.query(
        `SELECT o.customer_id, o.restaurant_id, o.fulfillment_state, o.delivered_at,
                (SELECT rider_id FROM delivery_assignments da
                  WHERE da.order_id = o.id AND da.status = 'COMPLETED' LIMIT 1) AS rider_id
           FROM orders o WHERE o.id = $1 FOR UPDATE`,
        [input.orderId]
      );
      const order = res.rows[0];
      if (!order || order.customer_id !== input.customerId) throw new DomainError("NOT_FOUND", "Order not found");
      if (order.fulfillment_state !== FulfillmentState.DELIVERED) {
        throw new DomainError("STATE_CONFLICT", "You can rate an order once it has been delivered.");
      }
      const deliveredAt = order.delivered_at as Date | null;
      if (deliveredAt && Date.now() - deliveredAt.getTime() > RatingRepository.RATING_WINDOW_DAYS * 86_400_000) {
        throw new DomainError("STATE_CONFLICT", "The rating window for this order has closed.");
      }

      const inserted = await client.query(
        `INSERT INTO order_ratings (id, order_id, customer_id, restaurant_id, rider_id, food_rating, delivery_rating, comment)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (order_id) DO NOTHING RETURNING id`,
        [
          input.orderId,
          input.customerId,
          order.restaurant_id,
          order.rider_id,
          input.foodRating,
          input.deliveryRating ?? null,
          input.comment?.trim() || null,
        ]
      );
      if (inserted.rows.length === 0) throw new DomainError("CONFLICT", "You have already rated this order.");

      await OutboxRepository.appendWithClient(client, "order.rated", input.orderId, 0, {
        orderId: input.orderId,
        restaurantId: order.restaurant_id,
        foodRating: input.foodRating,
      });
    });
  }

  static async listForRestaurant(restaurantId: string, limit = 20): Promise<RestaurantReviewDto[]> {
    const res = await getDbPool().query(
      `SELECT rt.id, rt.food_rating, rt.comment, rt.created_at, u.name
         FROM order_ratings rt JOIN app_users u ON u.id = rt.customer_id
        WHERE rt.restaurant_id = $1 AND rt.comment IS NOT NULL
        ORDER BY rt.created_at DESC LIMIT $2`,
      [restaurantId, Math.min(limit, 50)]
    );
    return res.rows.map((r) => ({
      id: r.id,
      // First name + initial only: reviews are public
      customerName: String(r.name).split(" ").slice(0, 2).map((p: string, i: number) => (i === 0 ? p : `${p[0]}.`)).join(" "),
      foodRating: r.food_rating,
      comment: r.comment ?? undefined,
      createdAt: (r.created_at as Date).toISOString(),
    }));
  }
}
