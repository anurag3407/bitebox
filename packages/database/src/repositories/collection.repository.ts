import { DomainError } from "@startup/core";
import { getDbPool } from "../client.js";
import { RestaurantRepository } from "./restaurant.repository.js";

export interface CollectionSummary {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  restaurantCount: number;
}

export interface CollectionDetail extends CollectionSummary {
  description?: string;
  restaurants: Awaited<ReturnType<typeof RestaurantRepository.summariesByIds>>;
}

function mapSummary(row: any): CollectionSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle ?? undefined,
    imageUrl: row.image_url ?? undefined,
    restaurantCount: Number(row.restaurant_count ?? 0),
  };
}

export class CollectionRepository {
  static async list(): Promise<CollectionSummary[]> {
    const res = await getDbPool().query(
      `SELECT c.*, COUNT(cr.restaurant_id)::int AS restaurant_count
         FROM collections c
         LEFT JOIN collection_restaurants cr ON cr.collection_id = c.id
        WHERE c.is_active
        GROUP BY c.id
        ORDER BY c.display_order ASC, c.title ASC`
    );
    return res.rows.map(mapSummary);
  }

  static async findBySlug(slug: string): Promise<CollectionDetail | null> {
    const res = await getDbPool().query(
      `SELECT c.*, COUNT(cr.restaurant_id)::int AS restaurant_count
         FROM collections c
         LEFT JOIN collection_restaurants cr ON cr.collection_id = c.id
        WHERE c.slug = $1 AND c.is_active
        GROUP BY c.id
        LIMIT 1`,
      [slug]
    );
    const row = res.rows[0];
    if (!row) return null;
    const links = await getDbPool().query(
      `SELECT restaurant_id FROM collection_restaurants WHERE collection_id = $1 ORDER BY rank ASC, restaurant_id`,
      [row.id]
    );
    const ids = links.rows.map((link: any) => link.restaurant_id as string);
    return {
      ...mapSummary(row),
      description: row.description ?? undefined,
      restaurants: await RestaurantRepository.summariesByIds(ids),
    };
  }

  static async addRestaurant(input: { slug: string; restaurantId: string; rank?: number }): Promise<void> {
    const collection = await getDbPool().query(`SELECT id FROM collections WHERE slug = $1`, [input.slug]);
    if (!collection.rows[0]) throw new DomainError("NOT_FOUND", "Collection not found");
    await getDbPool().query(
      `INSERT INTO collection_restaurants (collection_id, restaurant_id, rank)
       VALUES ($1, $2, $3)
       ON CONFLICT (collection_id, restaurant_id) DO UPDATE SET rank = EXCLUDED.rank`,
      [collection.rows[0].id, input.restaurantId, input.rank ?? 0]
    );
  }
}
