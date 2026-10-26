import { getDbPool } from "../client.js";
import { MealPassRepository } from "./meal-pass.repository.js";

export interface CampusDropPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface CampusPlan {
  id: string;
  name: string;
  skuType: string;
  totalMeals: number;
  pricePaise: number;
  validityDays: number;
  slotWindow: string;
  kitchenName: string;
}

export interface Campus {
  id: string;
  name: string;
  isActive: boolean;
  dropPoints: CampusDropPoint[];
  plans: CampusPlan[];
}

/** Campuses are clusters with at least one active meal plan and a drop point. */
export class CampusRepository {
  static async list(): Promise<Campus[]> {
    const pool = getDbPool();
    const clusters = await pool.query(
      `SELECT c.id, c.name, c.is_active,
              COUNT(DISTINCT d.id)::int AS drop_points
         FROM clusters c
         JOIN meal_plans pl ON pl.cluster_id = c.id AND pl.is_active
         LEFT JOIN drop_points d ON d.cluster_id = c.id
        WHERE c.is_active
        GROUP BY c.id
        ORDER BY c.name`
    );
    return Promise.all(
      clusters.rows.map(async (cluster) => {
        const [dropPoints, plans] = await Promise.all([
          pool.query(`SELECT id, name, latitude, longitude FROM drop_points WHERE cluster_id = $1 ORDER BY name`, [
            cluster.id,
          ]),
          MealPassRepository.listPlans(cluster.id),
        ]);
        return {
          id: cluster.id as string,
          name: cluster.name as string,
          isActive: cluster.is_active as boolean,
          dropPoints: dropPoints.rows.map((d) => ({
            id: d.id as string,
            name: d.name as string,
            latitude: d.latitude as number,
            longitude: d.longitude as number,
          })),
          plans: plans.map((p) => ({
            id: p.id as string,
            name: p.name as string,
            skuType: p.sku_type as string,
            totalMeals: p.total_meals as number,
            pricePaise: p.price_paise as number,
            validityDays: p.validity_days as number,
            slotWindow: p.slot_window as string,
            kitchenName: p.kitchen_name as string,
          })),
        };
      })
    );
  }
}
