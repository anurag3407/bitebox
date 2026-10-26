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
        `SELECT o.customer_id, o.restaurant_id, o.fulfillment_state, o.delivered_at, o.items_json,
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

      // Dish ratings must refer to items that were actually in this order
      const orderItems = (order.items_json as Array<{ menuItemId?: string }>) ?? [];
      const orderedItemIds = new Set(orderItems.map((i) => i.menuItemId).filter(Boolean));
      const dishRatings = input.dishRatings ?? [];
      if (dishRatings.some((rating) => !orderedItemIds.has(rating.menuItemId))) {
        throw new DomainError("VALIDATION_ERROR", "Dish ratings can only refer to items in this order.");
      }

      const inserted = await client.query(
        `INSERT INTO order_ratings
           (id, order_id, customer_id, restaurant_id, rider_id, food_rating, delivery_rating, comment, photos_json, dish_ratings_json)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (order_id) DO NOTHING RETURNING id`,
        [
          input.orderId,
          input.customerId,
          order.restaurant_id,
          order.rider_id,
          input.foodRating,
          input.deliveryRating ?? null,
          input.comment?.trim() || null,
          JSON.stringify(input.photos ?? []),
          JSON.stringify(dishRatings),
        ]
      );
      if (inserted.rows.length === 0) throw new DomainError("CONFLICT", "You have already rated this order.");

      await OutboxRepository.appendWithClient(client, "order.rated", input.orderId, 0, {
        orderId: input.orderId,
        restaurantId: order.restaurant_id,
        foodRating: input.foodRating,
        hasPhotos: (input.photos ?? []).length > 0,
        dishRatingCount: dishRatings.length,
      });
    });
  }

  static async listForRestaurant(restaurantId: string, limit = 20): Promise<RestaurantReviewDto[]> {
    const res = await getDbPool().query(
      `SELECT rt.id, rt.food_rating, rt.comment, rt.created_at, rt.photos_json, rt.dish_ratings_json,
              rt.restaurant_reply, rt.restaurant_replied_at, u.name
         FROM order_ratings rt JOIN app_users u ON u.id = rt.customer_id
        WHERE rt.restaurant_id = $1
          AND (rt.comment IS NOT NULL OR jsonb_array_length(rt.photos_json) > 0 OR rt.dish_ratings_json <> '[]')
        ORDER BY rt.created_at DESC LIMIT $2`,
      [restaurantId, Math.min(limit, 50)]
    );

    const dishIds = [...new Set(res.rows.flatMap((r) => (r.dish_ratings_json as Array<{ menuItemId: string }>).map((d) => d.menuItemId)))];
    const dishNames = new Map<string, string>();
    if (dishIds.length > 0) {
      const names = await getDbPool().query(`SELECT id, name FROM menu_items WHERE id = ANY($1::uuid[])`, [dishIds]);
      for (const row of names.rows) dishNames.set(row.id as string, row.name as string);
    }

    return res.rows.map((r) => ({
      id: r.id,
      // First name + initial only: reviews are public
      customerName: String(r.name).split(" ").slice(0, 2).map((p: string, i: number) => (i === 0 ? p : `${p[0]}.`)).join(" "),
      foodRating: r.food_rating,
      comment: r.comment ?? undefined,
      photos: (r.photos_json as string[]) ?? [],
      dishRatings: ((r.dish_ratings_json as Array<{ menuItemId: string; rating: number }>) ?? []).map((d) => ({
        menuItemId: d.menuItemId,
        name: dishNames.get(d.menuItemId) ?? "Dish",
        rating: d.rating,
      })),
      restaurantReply: r.restaurant_reply ?? undefined,
      restaurantRepliedAt: (r.restaurant_replied_at as Date | null)?.toISOString(),
      createdAt: (r.created_at as Date).toISOString(),
    }));
  }

  /** Merchant response to a public review; one reply per rating. */
  static async reply(restaurantId: string, ratingId: string, reply: string): Promise<void> {
    const res = await getDbPool().query(
      `UPDATE order_ratings
          SET restaurant_reply = $3, restaurant_replied_at = NOW()
        WHERE id = $1 AND restaurant_id = $2
        RETURNING order_id`,
      [ratingId, restaurantId, reply.trim()]
    );
    if (!res.rows[0]) throw new DomainError("NOT_FOUND", "Review not found for this restaurant");
    await OutboxRepository.appendWithClient(getDbPool(), "order.review_replied", res.rows[0].order_id, 0, {
      ratingId,
      restaurantId,
      preview: reply.slice(0, 120),
    });
  }

  static async listForRestaurantAdmin(restaurantId: string, limit = 50): Promise<RestaurantReviewDto[]> {
    return RatingRepository.listForRestaurant(restaurantId, limit);
  }
}
