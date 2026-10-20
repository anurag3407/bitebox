import { and, asc, eq, inArray } from "drizzle-orm";
import {
  Coordinate,
  DietaryTag,
  MenuCategoryDto,
  MenuItemDto,
  RestaurantDetailDto,
  RestaurantListRequest,
  RestaurantSummaryDto,
  StockPolicy,
} from "@startup/contracts";
import { OpeningHoursPolicy } from "@startup/core";
import { getDb, getDbPool } from "../client.js";
import {
  itemVariants,
  menuCategories,
  menuItems,
  modifierGroups,
  modifierOptions,
  restaurants,
} from "../schema/schema.js";

type RestaurantRow = typeof restaurants.$inferSelect;

// Riders average ~20 km/h in Indian city traffic; road distance ~1.3x straight line
const ROAD_FACTOR = 1.3;
const RIDER_SPEED_METERS_PER_MIN = 20_000 / 60;
// Discovery never looks further than this regardless of a restaurant's own radius
export const MAX_DISCOVERY_RADIUS_METERS = 15_000;

export interface RestaurantAvailability {
  isOpenNow: boolean;
  isAcceptingOrders: boolean;
  nextOpenText?: string;
}

export function evaluateAvailability(r: Pick<RestaurantRow, "isActive" | "isOpen" | "isAcceptingOrders" | "openingHours">, at = new Date()): RestaurantAvailability {
  const scheduleOpen = OpeningHoursPolicy.isOpenAt(r.openingHours ?? undefined, at);
  const isOpenNow = r.isActive && r.isOpen && scheduleOpen;
  return {
    isOpenNow,
    isAcceptingOrders: isOpenNow && r.isAcceptingOrders,
    nextOpenText: !isOpenNow && r.isActive && r.isOpen ? OpeningHoursPolicy.nextOpeningText(r.openingHours ?? undefined, at) : undefined,
  };
}

export function estimateDeliveryWindow(prepMinutes: number, distanceMeters: number): { min: number; max: number } {
  const travel = Math.ceil((distanceMeters * ROAD_FACTOR) / RIDER_SPEED_METERS_PER_MIN);
  const base = prepMinutes + travel + 5; // + dispatch & handoffs
  const min = Math.max(10, Math.round(base / 5) * 5);
  return { min, max: min + 10 };
}

function toSummary(r: RestaurantRow, extras: { distanceMeters?: number; at?: Date; favoriteIds?: Set<string> } = {}): RestaurantSummaryDto {
  const availability = evaluateAvailability(r, extras.at);
  const window =
    extras.distanceMeters !== undefined
      ? estimateDeliveryWindow(r.avgPrepMinutes, extras.distanceMeters)
      : { min: r.deliveryTimeMinMinutes, max: r.deliveryTimeMaxMinutes };
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    cuisines: r.cuisines,
    rating: Math.round(r.rating * 10) / 10,
    ratingCount: r.ratingCount,
    avgPriceForOnePaise: Math.max(1, r.avgPriceForOnePaise),
    deliveryTimeMinMinutes: window.min,
    deliveryTimeMaxMinutes: window.max,
    distanceMeters: extras.distanceMeters,
    isAcceptingOrders: availability.isAcceptingOrders,
    isOpen: availability.isOpenNow,
    nextOpenText: availability.nextOpenText,
    pureVeg: r.pureVeg,
    heroImageUrl: r.heroImageUrl ?? undefined,
    offerTag: r.offerTag ?? undefined,
    isServiceable:
      extras.distanceMeters !== undefined ? extras.distanceMeters <= r.maxDeliveryRadiusMeters : undefined,
    isFavorite: extras.favoriteIds ? extras.favoriteIds.has(r.id) : undefined,
  };
}

function mapRawRestaurant(row: any): RestaurantRow {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    cityId: row.city_id,
    serviceZoneId: row.service_zone_id,
    name: row.name,
    slug: row.slug,
    cuisines: row.cuisines,
    rating: row.rating,
    ratingCount: row.rating_count,
    avgPriceForOnePaise: row.avg_price_for_one_paise,
    deliveryTimeMinMinutes: row.delivery_time_min_minutes,
    deliveryTimeMaxMinutes: row.delivery_time_max_minutes,
    latitude: row.latitude,
    longitude: row.longitude,
    addressText: row.address_text,
    phone: row.phone,
    isAcceptingOrders: row.is_accepting_orders,
    isOpen: row.is_open,
    pureVeg: row.pure_veg,
    heroImageUrl: row.hero_image_url,
    offerTag: row.offer_tag,
    openingHours: row.opening_hours,
    maxDeliveryRadiusMeters: row.max_delivery_radius_meters,
    packagingFeePaise: row.packaging_fee_paise,
    avgPrepMinutes: row.avg_prep_minutes,
    commissionBp: row.commission_bp,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Haversine distance in SQL; $lat/$lng are the parameter placeholders to use. */
export function sqlDistanceMeters(lat: string, lng: string, table = "r"): string {
  return `(2 * 6371000 * ASIN(SQRT(
      POWER(SIN(RADIANS(${table}.latitude - ${lat}) / 2), 2) +
      COS(RADIANS(${lat})) * COS(RADIANS(${table}.latitude)) * POWER(SIN(RADIANS(${table}.longitude - ${lng}) / 2), 2)
    )))`;
}

export class RestaurantRepository {
  /**
   * Discovery feed. With a location: only restaurants that deliver there, nearest
   * candidates first (bounded by a bounding-box prefilter on an indexed lat/lng),
   * then sorted/filtered in memory. Open restaurants always rank above closed ones.
   */
  static async listSummaries(
    filters: Partial<RestaurantListRequest> & { favoriteIds?: Set<string> },
    now = new Date()
  ): Promise<{ restaurants: RestaurantSummaryDto[]; nextOffset: number | null }> {
    const pool = getDbPool();
    const params: unknown[] = [];
    const where: string[] = ["r.is_active"];
    let distanceExpr = "NULL::double precision";
    const hasLocation = filters.latitude !== undefined && filters.longitude !== undefined;

    if (hasLocation) {
      params.push(filters.latitude, filters.longitude);
      distanceExpr = sqlDistanceMeters("$1", "$2");
      const latDelta = MAX_DISCOVERY_RADIUS_METERS / 111_320;
      const lngDelta = MAX_DISCOVERY_RADIUS_METERS / (111_320 * Math.max(0.1, Math.cos((filters.latitude! * Math.PI) / 180)));
      params.push(filters.latitude! - latDelta, filters.latitude! + latDelta, filters.longitude! - lngDelta, filters.longitude! + lngDelta);
      where.push(`r.latitude BETWEEN $3 AND $4 AND r.longitude BETWEEN $5 AND $6`);
      where.push(`${distanceExpr} <= r.max_delivery_radius_meters`);
    }
    if (filters.pureVeg) where.push("r.pure_veg");
    if (filters.cuisine) {
      params.push(filters.cuisine);
      where.push(`EXISTS (SELECT 1 FROM unnest(r.cuisines) AS c WHERE c ILIKE $${params.length})`);
    }
    if (filters.minRating) {
      params.push(filters.minRating);
      where.push(`r.rating >= $${params.length}`);
    }
    if (filters.hasOffer) where.push("r.offer_tag IS NOT NULL");

    const res = await pool.query(
      `SELECT r.*, ${distanceExpr} AS distance_m
         FROM restaurants r
        WHERE ${where.join(" AND ")}
        ORDER BY ${hasLocation ? "distance_m ASC" : "r.rating DESC, r.name ASC"}
        LIMIT 500`,
      params
    );

    let list = res.rows.map((row) =>
      toSummary(mapRawRestaurant(row), {
        distanceMeters: row.distance_m === null ? undefined : Math.round(row.distance_m),
        at: now,
        favoriteIds: filters.favoriteIds,
      })
    );

    if (filters.maxDeliveryMinutes) {
      list = list.filter((r) => r.deliveryTimeMaxMinutes <= filters.maxDeliveryMinutes!);
    }

    const sortBy = filters.sortBy ?? "relevance";
    const comparators: Record<string, (a: RestaurantSummaryDto, b: RestaurantSummaryDto) => number> = {
      relevance: (a, b) =>
        b.rating * 2 - (b.distanceMeters ?? 0) / 2000 - (a.rating * 2 - (a.distanceMeters ?? 0) / 2000),
      distance: (a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0),
      rating: (a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount,
      delivery_time: (a, b) => a.deliveryTimeMinMinutes - b.deliveryTimeMinMinutes,
      cost_low_to_high: (a, b) => a.avgPriceForOnePaise - b.avgPriceForOnePaise,
      cost_high_to_low: (a, b) => b.avgPriceForOnePaise - a.avgPriceForOnePaise,
    };
    const compare = comparators[sortBy] ?? comparators.relevance!;
    list.sort((a, b) => Number(b.isAcceptingOrders) - Number(a.isAcceptingOrders) || compare(a, b));

    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 20;
    const page = list.slice(offset, offset + limit);
    return { restaurants: page, nextOffset: offset + limit < list.length ? offset + limit : null };
  }

  static async findBySlug(slug: string, now = new Date()): Promise<RestaurantDetailDto | null> {
    const db = getDb();
    const [restaurant] = await db
      .select()
      .from(restaurants)
      .where(and(eq(restaurants.slug, slug), eq(restaurants.isActive, true)))
      .limit(1);

    if (!restaurant) return null;

    // Fetch categories
    const categories = await db
      .select()
      .from(menuCategories)
      .where(and(eq(menuCategories.restaurantId, restaurant.id), eq(menuCategories.isActive, true)))
      .orderBy(menuCategories.displayOrder);

    // Fetch items
    const items = await db
      .select()
      .from(menuItems)
      .where(eq(menuItems.restaurantId, restaurant.id))
      .orderBy(asc(menuItems.displayOrder), asc(menuItems.name));

    const itemIds = items.map((i) => i.id);

    // Fetch variants & modifiers
    const variants =
      itemIds.length > 0
        ? await db.select().from(itemVariants).where(inArray(itemVariants.menuItemId, itemIds)).orderBy(asc(itemVariants.pricePaise))
        : [];

    const groups =
      itemIds.length > 0
        ? await db.select().from(modifierGroups).where(inArray(modifierGroups.menuItemId, itemIds))
        : [];

    const groupIds = groups.map((g) => g.id);
    const options =
      groupIds.length > 0
        ? await db.select().from(modifierOptions).where(inArray(modifierOptions.groupId, groupIds))
        : [];

    // Assemble hierarchical DTO
    const populatedCategories: MenuCategoryDto[] = categories.map((cat) => {
      const catItems: MenuItemDto[] = items
        .filter((item) => item.categoryId === cat.id)
        .map((item) => {
          const itemVars = variants
            .filter((v) => v.menuItemId === item.id)
            .map((v) => ({
              id: v.id,
              name: v.name,
              pricePaise: v.pricePaise,
              isAvailable: v.isAvailable,
            }));

          const itemGroups = groups
            .filter((g) => g.menuItemId === item.id)
            .map((g) => ({
              id: g.id,
              name: g.name,
              minSelect: g.minSelect,
              maxSelect: g.maxSelect,
              isRequired: g.isRequired,
              options: options
                .filter((o) => o.groupId === g.id)
                .map((o) => ({
                  id: o.id,
                  name: o.name,
                  pricePaise: o.pricePaise,
                  isAvailable: o.isAvailable,
                })),
            }));

          return {
            id: item.id,
            name: item.name,
            description: item.description ?? undefined,
            pricePaise: item.pricePaise,
            dietaryTag: item.dietaryTag as DietaryTag,
            stockPolicy: item.stockPolicy as StockPolicy,
            isAvailable: item.isAvailable,
            imageUrl: item.imageUrl ?? undefined,
            isBestseller: item.isBestseller,
            variants: itemVars,
            modifierGroups: itemGroups,
          };
        });

      return {
        id: cat.id,
        name: cat.name,
        displayOrder: cat.displayOrder,
        items: catItems,
      };
    });

    return {
      ...toSummary(restaurant, { at: now }),
      addressText: restaurant.addressText,
      phone: restaurant.phone ?? undefined,
      latitude: restaurant.latitude,
      longitude: restaurant.longitude,
      openingHours: restaurant.openingHours ?? undefined,
      categories: populatedCategories,
    };
  }

  static async findById(id: string): Promise<RestaurantRow | null> {
    const db = getDb();
    const [row] = await db.select().from(restaurants).where(eq(restaurants.id, id)).limit(1);
    return row ?? null;
  }

  static async findSummariesByIds(ids: string[], location?: Coordinate): Promise<RestaurantSummaryDto[]> {
    if (ids.length === 0) return [];
    const params: unknown[] = [ids];
    let distanceExpr = "NULL::double precision";
    if (location) {
      params.push(location.latitude, location.longitude);
      distanceExpr = sqlDistanceMeters("$2", "$3");
    }
    const res = await getDbPool().query(
      `SELECT r.*, ${distanceExpr} AS distance_m FROM restaurants r WHERE r.id = ANY($1::uuid[]) AND r.is_active`,
      params
    );
    return res.rows.map((row) =>
      toSummary(mapRawRestaurant(row), { distanceMeters: row.distance_m === null ? undefined : Math.round(row.distance_m) })
    );
  }

  static async updateStatus(id: string, isOpen: boolean, isAcceptingOrders: boolean): Promise<void> {
    const db = getDb();
    await db
      .update(restaurants)
      .set({ isOpen, isAcceptingOrders, updatedAt: new Date() })
      .where(eq(restaurants.id, id));
  }

  static async setAcceptingOrders(id: string, isAcceptingOrders: boolean): Promise<RestaurantRow | null> {
    const [row] = await getDb()
      .update(restaurants)
      .set({ isAcceptingOrders, updatedAt: new Date() })
      .where(eq(restaurants.id, id))
      .returning();
    return row ?? null;
  }

  /** Marks a dish in/out of stock; returns the restaurant slug so callers can bust menu caches. */
  static async setItemAvailability(
    restaurantId: string,
    itemId: string,
    isAvailable: boolean
  ): Promise<{ slug: string } | null> {
    const res = await getDbPool().query(
      `UPDATE menu_items mi SET is_available = $3, updated_at = NOW()
         FROM restaurants r
        WHERE mi.id = $2 AND mi.restaurant_id = $1 AND r.id = mi.restaurant_id
        RETURNING r.slug`,
      [restaurantId, itemId, isAvailable]
    );
    return res.rows[0] ? { slug: res.rows[0].slug } : null;
  }

  static async listForMerchantUser(userId: string): Promise<Array<{ id: string; name: string; slug: string; staffRole: string; isAcceptingOrders: boolean; isOpen: boolean }>> {
    const res = await getDbPool().query(
      `SELECT r.id, r.name, r.slug, r.is_accepting_orders, r.is_open, m.staff_role
         FROM merchant_memberships m JOIN restaurants r ON r.id = m.restaurant_id
        WHERE m.user_id = $1 AND m.is_active
        ORDER BY r.name`,
      [userId]
    );
    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      staffRole: r.staff_role,
      isAcceptingOrders: r.is_accepting_orders,
      isOpen: r.is_open,
    }));
  }

  static async getMembership(userId: string, restaurantId: string): Promise<{ staffRole: string } | null> {
    const res = await getDbPool().query(
      `SELECT staff_role FROM merchant_memberships WHERE user_id = $1 AND restaurant_id = $2 AND is_active`,
      [userId, restaurantId]
    );
    return res.rows[0] ? { staffRole: res.rows[0].staff_role } : null;
  }

  /**
   * Recomputes the displayed rating from verified customer reviews. Below
   * MIN_REVIEWS_FOR_RATING the onboarding rating is kept so a single review
   * cannot swing a new restaurant to 1 or 5 stars.
   */
  static readonly MIN_REVIEWS_FOR_RATING = 5;

  static async refreshRatingAggregate(restaurantId: string): Promise<void> {
    await getDbPool().query(
      `UPDATE restaurants r
          SET rating = ROUND(agg.avg_rating::numeric, 1),
              rating_count = agg.cnt,
              updated_at = NOW()
         FROM (SELECT AVG(food_rating)::float AS avg_rating, COUNT(*)::int AS cnt
                 FROM order_ratings WHERE restaurant_id = $1) agg
        WHERE r.id = $1 AND agg.cnt >= $2`,
      [restaurantId, RestaurantRepository.MIN_REVIEWS_FOR_RATING]
    );
  }
}
