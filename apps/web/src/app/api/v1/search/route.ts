import { NextRequest } from "next/server";
import { SearchRequestSchema } from "@startup/contracts";
import { getDb, menuItems, restaurants } from "@startup/database";
import { apiError, apiSuccess } from "@/server/api-response";
import { and, eq, ilike, or } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q") || "";
    const pureVeg = searchParams.get("pureVeg") === "true";

    if (!query.trim()) {
      return apiSuccess({ restaurants: [], dishes: [] });
    }

    const db = getDb();

    // 1. Search matching restaurants
    const resWhere = pureVeg
      ? and(ilike(restaurants.name, `%${query}%`), eq(restaurants.pureVeg, true))
      : ilike(restaurants.name, `%${query}%`);

    const matchingRestaurants = await db
      .select()
      .from(restaurants)
      .where(resWhere)
      .limit(10);

    // 2. Search matching dishes
    const dishWhere = pureVeg
      ? and(ilike(menuItems.name, `%${query}%`), eq(menuItems.dietaryTag, "VEG"))
      : ilike(menuItems.name, `%${query}%`);

    const matchingDishes = await db
      .select({
        dish: menuItems,
        restaurant: restaurants,
      })
      .from(menuItems)
      .innerJoin(restaurants, eq(menuItems.restaurantId, restaurants.id))
      .where(dishWhere)
      .limit(15);

    return apiSuccess({
      restaurants: matchingRestaurants.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        cuisines: r.cuisines,
        rating: r.rating,
        ratingCount: r.ratingCount,
        avgPriceForOnePaise: r.avgPriceForOnePaise,
        deliveryTimeMinMinutes: r.deliveryTimeMinMinutes,
        deliveryTimeMaxMinutes: r.deliveryTimeMaxMinutes,
        isAcceptingOrders: r.isAcceptingOrders,
        isOpen: r.isOpen,
        pureVeg: r.pureVeg,
        heroImageUrl: r.heroImageUrl ?? undefined,
        offerTag: r.offerTag ?? undefined,
      })),
      dishes: matchingDishes.map((d) => ({
        dish: {
          id: d.dish.id,
          name: d.dish.name,
          description: d.dish.description ?? undefined,
          pricePaise: d.dish.pricePaise,
          dietaryTag: d.dish.dietaryTag as any,
          stockPolicy: d.dish.stockPolicy as any,
          isAvailable: d.dish.isAvailable,
          imageUrl: d.dish.imageUrl ?? undefined,
          variants: [],
          modifierGroups: [],
        },
        restaurant: {
          id: d.restaurant.id,
          slug: d.restaurant.slug,
          name: d.restaurant.name,
          cuisines: d.restaurant.cuisines,
          rating: d.restaurant.rating,
          ratingCount: d.restaurant.ratingCount,
          avgPriceForOnePaise: d.restaurant.avgPriceForOnePaise,
          deliveryTimeMinMinutes: d.restaurant.deliveryTimeMinMinutes,
          deliveryTimeMaxMinutes: d.restaurant.deliveryTimeMaxMinutes,
          isAcceptingOrders: d.restaurant.isAcceptingOrders,
          isOpen: d.restaurant.isOpen,
          pureVeg: d.restaurant.pureVeg,
          heroImageUrl: d.restaurant.heroImageUrl ?? undefined,
          offerTag: d.restaurant.offerTag ?? undefined,
        },
      })),
    });
  } catch (err: any) {
    return apiError("INTERNAL_ERROR", err.message || "Search failed", 500);
  }
}
