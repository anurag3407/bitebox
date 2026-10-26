import type { PoolClient } from "pg";
import { MenuItemInput, RestaurantSettings } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { getDbPool, withTransaction } from "../client.js";

export interface EditableMenu {
  restaurant: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    phone: string | null;
    packagingFeePaise: number;
    avgPrepMinutes: number;
    avgPriceForOnePaise: number;
    heroImageUrl: string | null;
    isOpen: boolean;
    openingHours: RestaurantSettings["openingHours"];
    amenities: string[];
    gallery: string[];
    hygieneRating: number | null;
  };
  categories: Array<{
    id: string;
    name: string;
    isActive: boolean;
    displayOrder: number;
    items: Array<MenuItemInput & { id: string }>;
  }>;
}

async function slugOf(client: Pick<PoolClient, "query">, restaurantId: string): Promise<string> {
  const res = await client.query(`SELECT slug FROM restaurants WHERE id = $1`, [restaurantId]);
  if (!res.rows[0]) throw new DomainError("NOT_FOUND", "Restaurant not found");
  return res.rows[0].slug;
}

/**
 * Write side of the catalogue for restaurant staff. Every mutation is scoped by
 * restaurant id so one outlet can never touch another's menu, and returns the slug
 * so callers can invalidate the cached public menu.
 */
export class MenuEditorRepository {
  static async getEditableMenu(restaurantId: string): Promise<EditableMenu> {
    const pool = getDbPool();
    const r = (await pool.query(`SELECT * FROM restaurants WHERE id = $1`, [restaurantId])).rows[0];
    if (!r) throw new DomainError("NOT_FOUND", "Restaurant not found");
    const [cats, items, variants, groups, options] = await Promise.all([
      pool.query(`SELECT * FROM menu_categories WHERE restaurant_id = $1 AND archived_at IS NULL ORDER BY display_order, name`, [restaurantId]),
      pool.query(`SELECT * FROM menu_items WHERE restaurant_id = $1 AND archived_at IS NULL ORDER BY display_order, name`, [restaurantId]),
      pool.query(
        `SELECT v.* FROM item_variants v JOIN menu_items mi ON mi.id = v.menu_item_id WHERE mi.restaurant_id = $1 ORDER BY v.price_paise`,
        [restaurantId]
      ),
      pool.query(
        `SELECT g.* FROM modifier_groups g JOIN menu_items mi ON mi.id = g.menu_item_id WHERE mi.restaurant_id = $1 ORDER BY g.created_at`,
        [restaurantId]
      ),
      pool.query(
        `SELECT o.* FROM modifier_options o JOIN modifier_groups g ON g.id = o.group_id JOIN menu_items mi ON mi.id = g.menu_item_id
          WHERE mi.restaurant_id = $1 ORDER BY o.created_at`,
        [restaurantId]
      ),
    ]);

    return {
      restaurant: {
        id: r.id,
        slug: r.slug,
        name: r.name,
        description: r.description,
        phone: r.phone,
        packagingFeePaise: r.packaging_fee_paise,
        avgPrepMinutes: r.avg_prep_minutes,
        avgPriceForOnePaise: r.avg_price_for_one_paise,
        heroImageUrl: r.hero_image_url,
        isOpen: r.is_open,
        openingHours: r.opening_hours,
        amenities: r.amenities ?? [],
        gallery: r.gallery_json ?? [],
        hygieneRating: r.hygiene_rating ?? null,
      },
      categories: cats.rows.map((c) => ({
        id: c.id,
        name: c.name,
        isActive: c.is_active,
        displayOrder: c.display_order,
        items: items.rows
          .filter((i) => i.category_id === c.id)
          .map((i) => ({
            id: i.id,
            categoryId: i.category_id,
            name: i.name,
            description: i.description ?? undefined,
            pricePaise: i.price_paise,
            dietaryTag: i.dietary_tag,
            imageUrl: i.image_url ?? undefined,
            isBestseller: i.is_bestseller,
            isAvailable: i.is_available,
            displayOrder: i.display_order,
            allergens: i.allergens ?? [],
            nutrition: i.nutrition_json ?? undefined,
            spiceLevel: i.spice_level ?? 0,
            serves: i.serves ?? undefined,
            variants: variants.rows
              .filter((v) => v.menu_item_id === i.id)
              .map((v) => ({ id: v.id, name: v.name, pricePaise: v.price_paise, isAvailable: v.is_available })),
            modifierGroups: groups.rows
              .filter((g) => g.menu_item_id === i.id)
              .map((g) => ({
                id: g.id,
                name: g.name,
                minSelect: g.min_select,
                maxSelect: g.max_select,
                isRequired: g.is_required,
                options: options.rows
                  .filter((o) => o.group_id === g.id)
                  .map((o) => ({ id: o.id, name: o.name, pricePaise: o.price_paise, isAvailable: o.is_available })),
              })),
          })),
      })),
    };
  }

  static async createCategory(restaurantId: string, input: { name: string; displayOrder?: number }): Promise<{ id: string; slug: string }> {
    const res = await getDbPool().query(
      `INSERT INTO menu_categories (restaurant_id, name, display_order)
       VALUES ($1, $2, COALESCE($3, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM menu_categories WHERE restaurant_id = $1)))
       RETURNING id`,
      [restaurantId, input.name, input.displayOrder ?? null]
    );
    return { id: res.rows[0].id, slug: await slugOf(getDbPool(), restaurantId) };
  }

  static async updateCategory(
    restaurantId: string,
    categoryId: string,
    input: { name?: string; isActive?: boolean; displayOrder?: number }
  ): Promise<{ slug: string }> {
    const res = await getDbPool().query(
      `UPDATE menu_categories SET name = COALESCE($3, name), is_active = COALESCE($4, is_active), display_order = COALESCE($5, display_order)
        WHERE id = $2 AND restaurant_id = $1 AND archived_at IS NULL RETURNING id`,
      [restaurantId, categoryId, input.name ?? null, input.isActive ?? null, input.displayOrder ?? null]
    );
    if (!res.rows[0]) throw new DomainError("NOT_FOUND", "Category not found");
    return { slug: await slugOf(getDbPool(), restaurantId) };
  }

  static async archiveCategory(restaurantId: string, categoryId: string): Promise<{ slug: string }> {
    return withTransaction(async (client) => {
      const items = await client.query(
        `SELECT 1 FROM menu_items WHERE category_id = $1 AND archived_at IS NULL LIMIT 1`,
        [categoryId]
      );
      if (items.rows.length) throw new DomainError("CONFLICT", "Move or delete the dishes in this category first.");
      const res = await client.query(
        `UPDATE menu_categories SET archived_at = NOW() WHERE id = $2 AND restaurant_id = $1 AND archived_at IS NULL RETURNING id`,
        [restaurantId, categoryId]
      );
      if (!res.rows[0]) throw new DomainError("NOT_FOUND", "Category not found");
      return { slug: await slugOf(client, restaurantId) };
    });
  }

  /**
   * Creates or replaces a dish with its full variant and modifier tree. Existing child
   * ids are kept (carts reference them); children missing from the input are removed.
   */
  static async saveItem(restaurantId: string, itemId: string | null, input: MenuItemInput): Promise<{ id: string; slug: string }> {
    return withTransaction(async (client) => {
      const cat = await client.query(
        `SELECT 1 FROM menu_categories WHERE id = $1 AND restaurant_id = $2 AND archived_at IS NULL`,
        [input.categoryId, restaurantId]
      );
      if (!cat.rows[0]) throw new DomainError("VALIDATION_ERROR", "Choose a category of this restaurant");

      let id = itemId;
      const fields = [
        input.categoryId,
        input.name,
        input.description || null,
        input.pricePaise,
        input.dietaryTag,
        input.imageUrl || null,
        input.isBestseller,
        input.isAvailable,
        input.displayOrder,
        input.allergens ?? [],
        input.nutrition ? JSON.stringify(input.nutrition) : null,
        input.spiceLevel ?? 0,
        input.serves ?? null,
      ];
      if (id) {
        const res = await client.query(
          `UPDATE menu_items SET category_id = $3, name = $4, description = $5, price_paise = $6, dietary_tag = $7,
                  image_url = $8, is_bestseller = $9, is_available = $10, display_order = $11,
                  allergens = $12, nutrition_json = $13, spice_level = $14, serves = $15, updated_at = NOW()
            WHERE id = $1 AND restaurant_id = $2 AND archived_at IS NULL RETURNING id`,
          [id, restaurantId, ...fields]
        );
        if (!res.rows[0]) throw new DomainError("NOT_FOUND", "Dish not found");
      } else {
        const res = await client.query(
          `INSERT INTO menu_items (restaurant_id, category_id, name, description, price_paise, dietary_tag, image_url,
                                   is_bestseller, is_available, display_order, allergens, nutrition_json, spice_level, serves)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
          [restaurantId, ...fields]
        );
        id = res.rows[0].id as string;
      }

      // Variants
      const keepVariants = input.variants.filter((v) => v.id).map((v) => v.id!);
      await client.query(`DELETE FROM item_variants WHERE menu_item_id = $1 AND NOT (id = ANY($2::uuid[]))`, [id, keepVariants]);
      for (const v of input.variants) {
        if (v.id) {
          const res = await client.query(
            `UPDATE item_variants SET name = $3, price_paise = $4, is_available = $5 WHERE id = $1 AND menu_item_id = $2 RETURNING id`,
            [v.id, id, v.name, v.pricePaise, v.isAvailable]
          );
          if (!res.rows[0]) throw new DomainError("VALIDATION_ERROR", "Unknown portion id");
        } else {
          await client.query(`INSERT INTO item_variants (menu_item_id, name, price_paise, is_available) VALUES ($1, $2, $3, $4)`, [
            id,
            v.name,
            v.pricePaise,
            v.isAvailable,
          ]);
        }
      }

      // Modifier groups and their options
      const keepGroups = input.modifierGroups.filter((g) => g.id).map((g) => g.id!);
      await client.query(
        `DELETE FROM modifier_options WHERE group_id IN (SELECT id FROM modifier_groups WHERE menu_item_id = $1 AND NOT (id = ANY($2::uuid[])))`,
        [id, keepGroups]
      );
      await client.query(`DELETE FROM modifier_groups WHERE menu_item_id = $1 AND NOT (id = ANY($2::uuid[]))`, [id, keepGroups]);
      for (const g of input.modifierGroups) {
        let groupId = g.id;
        if (groupId) {
          const res = await client.query(
            `UPDATE modifier_groups SET name = $3, min_select = $4, max_select = $5, is_required = $6
              WHERE id = $1 AND menu_item_id = $2 RETURNING id`,
            [groupId, id, g.name, g.minSelect, g.maxSelect, g.isRequired]
          );
          if (!res.rows[0]) throw new DomainError("VALIDATION_ERROR", "Unknown add-on group id");
        } else {
          const res = await client.query(
            `INSERT INTO modifier_groups (menu_item_id, name, min_select, max_select, is_required) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [id, g.name, g.minSelect, g.maxSelect, g.isRequired]
          );
          groupId = res.rows[0].id as string;
        }
        const keepOptions = g.options.filter((o) => o.id).map((o) => o.id!);
        await client.query(`DELETE FROM modifier_options WHERE group_id = $1 AND NOT (id = ANY($2::uuid[]))`, [groupId, keepOptions]);
        for (const o of g.options) {
          if (o.id) {
            const res = await client.query(
              `UPDATE modifier_options SET name = $3, price_paise = $4, is_available = $5 WHERE id = $1 AND group_id = $2 RETURNING id`,
              [o.id, groupId, o.name, o.pricePaise, o.isAvailable]
            );
            if (!res.rows[0]) throw new DomainError("VALIDATION_ERROR", "Unknown add-on option id");
          } else {
            await client.query(`INSERT INTO modifier_options (group_id, name, price_paise, is_available) VALUES ($1, $2, $3, $4)`, [
              groupId,
              o.name,
              o.pricePaise,
              o.isAvailable,
            ]);
          }
        }
      }

      return { id: id!, slug: await slugOf(client, restaurantId) };
    });
  }

  static async archiveItem(restaurantId: string, itemId: string): Promise<{ slug: string }> {
    const res = await getDbPool().query(
      `UPDATE menu_items SET archived_at = NOW(), is_available = false, updated_at = NOW()
        WHERE id = $1 AND restaurant_id = $2 AND archived_at IS NULL RETURNING id`,
      [itemId, restaurantId]
    );
    if (!res.rows[0]) throw new DomainError("NOT_FOUND", "Dish not found");
    return { slug: await slugOf(getDbPool(), restaurantId) };
  }

  static async updateSettings(restaurantId: string, input: RestaurantSettings): Promise<{ slug: string }> {
    const res = await getDbPool().query(
      `UPDATE restaurants
          SET description = COALESCE($2, description),
              phone = COALESCE($3, phone),
              packaging_fee_paise = COALESCE($4, packaging_fee_paise),
              avg_prep_minutes = COALESCE($5, avg_prep_minutes),
              avg_price_for_one_paise = COALESCE($6, avg_price_for_one_paise),
              hero_image_url = COALESCE($7, hero_image_url),
              is_open = COALESCE($8, is_open),
              opening_hours = CASE WHEN $9::boolean THEN $10::jsonb ELSE opening_hours END,
              amenities = COALESCE($11, amenities),
              gallery_json = COALESCE($12, gallery_json),
              hygiene_rating = COALESCE($13, hygiene_rating),
              updated_at = NOW()
        WHERE id = $1 RETURNING slug`,
      [
        restaurantId,
        input.description ?? null,
        input.phone ?? null,
        input.packagingFeePaise ?? null,
        input.avgPrepMinutes ?? null,
        input.avgPriceForOnePaise ?? null,
        input.heroImageUrl ?? null,
        input.isOpen ?? null,
        input.openingHours !== undefined,
        input.openingHours ? JSON.stringify(input.openingHours) : null,
        input.amenities ?? null,
        input.gallery ? JSON.stringify(input.gallery) : null,
        input.hygieneRating ?? null,
      ]
    );
    if (!res.rows[0]) throw new DomainError("NOT_FOUND", "Restaurant not found");
    return { slug: res.rows[0].slug };
  }
}
