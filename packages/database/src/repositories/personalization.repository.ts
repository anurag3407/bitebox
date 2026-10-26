import type { RestaurantSummaryDto } from "@startup/contracts";
import { getDbPool } from "../client.js";
import { RestaurantRepository } from "./restaurant.repository.js";

export interface CuisineAffinity {
  cuisine: string;
  orders: number;
  lastOrderedAt: string;
}

export interface PersonalizedFeed {
  affinity: CuisineAffinity[];
  reorder: RestaurantSummaryDto[];
  recommended: RestaurantSummaryDto[];
  headline: string;
}

/** Turns delivered-order history into a small, explainable discovery feed. */
export class PersonalizationRepository {
  static async feed(input: {
    userId: string;
    latitude?: number;
    longitude?: number;
    limit?: number;
  }): Promise<PersonalizedFeed> {
    const limit = input.limit ?? 6;
    const pool = getDbPool();
    const [affinityRes, reorderRes] = await Promise.all([
      pool.query(
        `SELECT c.cuisine, COUNT(*)::int AS orders, MAX(o.delivered_at) AS last_ordered
           FROM orders o
           JOIN restaurants r ON r.id = o.restaurant_id
           CROSS JOIN LATERAL unnest(r.cuisines) AS c(cuisine)
          WHERE o.customer_id = $1 AND o.fulfillment_state = 'DELIVERED'
          GROUP BY c.cuisine
          ORDER BY orders DESC, last_ordered DESC, c.cuisine ASC
          LIMIT 3`,
        [input.userId]
      ),
      pool.query(
        `SELECT restaurant_id, COUNT(*)::int AS orders, MAX(delivered_at) AS last_order
           FROM orders
          WHERE customer_id = $1 AND fulfillment_state = 'DELIVERED'
          GROUP BY restaurant_id
          ORDER BY last_order DESC
          LIMIT 4`,
        [input.userId]
      ),
    ]);

    const affinity: CuisineAffinity[] = affinityRes.rows.map((r) => ({
      cuisine: r.cuisine as string,
      orders: Number(r.orders),
      lastOrderedAt: (r.last_ordered as Date).toISOString(),
    }));
    const reorderIds = reorderRes.rows.map((r) => r.restaurant_id as string);
    const reorder = await RestaurantRepository.summariesByIds(reorderIds);

    const topCuisine = affinity[0]?.cuisine;
    const candidates = await RestaurantRepository.listSummaries({
      latitude: input.latitude,
      longitude: input.longitude,
      cuisine: topCuisine,
      sortBy: topCuisine ? "relevance" : "rating",
      limit: 18,
    });
    const exclude = new Set(reorderIds);
    const recommended = candidates.restaurants.filter((r) => !exclude.has(r.id)).slice(0, limit);
    if (recommended.length < limit) {
      const seen = new Set([...exclude, ...recommended.map((r) => r.id)]);
      const fallback = await RestaurantRepository.listSummaries({
        latitude: input.latitude,
        longitude: input.longitude,
        sortBy: "rating",
        limit: 30,
      });
      for (const restaurant of fallback.restaurants) {
        if (recommended.length >= limit) break;
        if (seen.has(restaurant.id)) continue;
        seen.add(restaurant.id);
        recommended.push(restaurant);
      }
    }

    return {
      affinity,
      reorder,
      recommended,
      headline: topCuisine ? `Because you ordered ${topCuisine}` : "Popular near you",
    };
  }
}
