import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  MenuCategoryDto,
  MenuItemDto,
  RestaurantDetailDto,
  RestaurantSummaryDto,
} from "@startup/contracts";
import { getDb } from "../client.js";
import {
  itemVariants,
  menuCategories,
  menuItems,
  modifierGroups,
  modifierOptions,
  restaurants,
} from "../schema/schema.js";

export class RestaurantRepository {
  static async listSummaries(filters: {
    pureVeg?: boolean;
    cuisine?: string;
    limit?: number;
    offset?: number;
  }): Promise<RestaurantSummaryDto[]> {
    const db = getDb();
    const conditions = [];

    if (filters.pureVeg) {
      conditions.push(eq(restaurants.pureVeg, true));
    }

    if (filters.cuisine) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM unnest(${restaurants.cuisines}) AS c WHERE c ILIKE ${filters.cuisine})`
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select()
      .from(restaurants)
      .where(whereClause)
      .limit(filters.limit ?? 20)
      .offset(filters.offset ?? 0);

    return rows.map((r) => ({
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
    }));
  }

  static async findBySlug(slug: string): Promise<RestaurantDetailDto | null> {
    const db = getDb();
    const [restaurant] = await db
      .select()
      .from(restaurants)
      .where(eq(restaurants.slug, slug))
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
      .where(eq(menuItems.restaurantId, restaurant.id));

    const itemIds = items.map((i) => i.id);

    // Fetch variants & modifiers
    const variants =
      itemIds.length > 0
        ? await db.select().from(itemVariants).where(inArray(itemVariants.menuItemId, itemIds))
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
            dietaryTag: item.dietaryTag as any,
            stockPolicy: item.stockPolicy as any,
            isAvailable: item.isAvailable,
            imageUrl: item.imageUrl ?? undefined,
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
      id: restaurant.id,
      slug: restaurant.slug,
      name: restaurant.name,
      cuisines: restaurant.cuisines,
      rating: restaurant.rating,
      ratingCount: restaurant.ratingCount,
      avgPriceForOnePaise: restaurant.avgPriceForOnePaise,
      deliveryTimeMinMinutes: restaurant.deliveryTimeMinMinutes,
      deliveryTimeMaxMinutes: restaurant.deliveryTimeMaxMinutes,
      isAcceptingOrders: restaurant.isAcceptingOrders,
      isOpen: restaurant.isOpen,
      pureVeg: restaurant.pureVeg,
      heroImageUrl: restaurant.heroImageUrl ?? undefined,
      offerTag: restaurant.offerTag ?? undefined,
      addressText: restaurant.addressText,
      phone: restaurant.phone ?? undefined,
      categories: populatedCategories,
    };
  }

  static async findById(id: string): Promise<typeof restaurants.$inferSelect | null> {
    const db = getDb();
    const [row] = await db.select().from(restaurants).where(eq(restaurants.id, id)).limit(1);
    return row ?? null;
  }

  static async updateStatus(id: string, isOpen: boolean, isAcceptingOrders: boolean): Promise<void> {
    const db = getDb();
    await db
      .update(restaurants)
      .set({ isOpen, isAcceptingOrders })
      .where(eq(restaurants.id, id));
  }
}
