import { getDbPool } from "../client.js";

export class FavoriteRepository {
  static async listIds(userId: string): Promise<Set<string>> {
    const res = await getDbPool().query(`SELECT restaurant_id FROM user_favorites WHERE user_id = $1`, [userId]);
    return new Set(res.rows.map((r) => r.restaurant_id as string));
  }

  static async add(userId: string, restaurantId: string): Promise<void> {
    await getDbPool().query(
      `INSERT INTO user_favorites (user_id, restaurant_id)
       SELECT $1, id FROM restaurants WHERE id = $2 AND is_active
       ON CONFLICT DO NOTHING`,
      [userId, restaurantId]
    );
  }

  static async remove(userId: string, restaurantId: string): Promise<void> {
    await getDbPool().query(`DELETE FROM user_favorites WHERE user_id = $1 AND restaurant_id = $2`, [userId, restaurantId]);
  }
}
