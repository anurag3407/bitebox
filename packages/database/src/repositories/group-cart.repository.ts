import { randomBytes } from "node:crypto";
import { DomainError } from "@startup/core";
import { getDbPool, withTransaction } from "../client.js";

const MAX_MEMBERS = 12;
const MAX_LINES = 50;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export interface GroupCartParticipant {
  userId: string;
  name: string;
  isHost: boolean;
  itemCount: number;
  subtotalPaise: number;
}

export interface GroupCartOption {
  id: string;
  name: string;
  pricePaise: number;
}

export interface GroupCartLine {
  id: string;
  participantId: string;
  participantName: string;
  menuItemId: string;
  name: string;
  variantId?: string;
  variantName?: string;
  basePricePaise: number;
  selectedOptions: GroupCartOption[];
  unitPricePaise: number;
  quantity: number;
  lineTotalPaise: number;
  notes?: string;
  imageUrl?: string;
  isVeg: boolean;
  canEdit: boolean;
}

export interface GroupCart {
  id: string;
  code: string;
  status: "OPEN" | "LOCKED" | "COMPLETED" | "ABANDONED";
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  hostId: string;
  hostName: string;
  viewerId: string;
  orderId?: string;
  expiresAt: string;
  createdAt: string;
  isHost: boolean;
  isParticipant: boolean;
  participants: GroupCartParticipant[];
  lines: GroupCartLine[];
  participantCount: number;
  itemCount: number;
  subtotalPaise: number;
}

function effectiveStatus(status: string, expiresAt: Date): GroupCart["status"] {
  if (status === "OPEN" && expiresAt.getTime() < Date.now()) return "ABANDONED";
  return status as GroupCart["status"];
}

function generateCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (const byte of bytes) code += CODE_ALPHABET.charAt(byte % CODE_ALPHABET.length);
  return code;
}

async function loadCart(client: any, code: string, viewerId: string): Promise<GroupCart | null> {
  const res = await client.query(
    `SELECT g.*, r.name AS restaurant_name, r.slug AS restaurant_slug, u.name AS host_name, o.order_number
       FROM group_carts g
       JOIN restaurants r ON r.id = g.restaurant_id
       JOIN app_users u ON u.id = g.host_user_id
       LEFT JOIN orders o ON o.id = g.order_id
      WHERE g.code = $1
      LIMIT 1`,
    [code.toUpperCase()]
  );
  const cart = res.rows[0];
  if (!cart) return null;

  const memberRes = await client.query(
    `SELECT m.user_id, m.joined_at, u.name
       FROM group_cart_members m
       JOIN app_users u ON u.id = m.user_id
      WHERE m.group_cart_id = $1
      ORDER BY m.joined_at, u.name`,
    [cart.id]
  );
  const lineRes = await client.query(
    `SELECT i.*, mi.name, mi.image_url, mi.dietary_tag, mi.price_paise AS item_price,
            v.name AS variant_name, v.price_paise AS variant_price, u.name AS participant_name
       FROM group_cart_items i
       JOIN menu_items mi ON mi.id = i.menu_item_id
       LEFT JOIN item_variants v ON v.id = i.variant_id
       JOIN app_users u ON u.id = i.participant_user_id
      WHERE i.group_cart_id = $1
      ORDER BY i.created_at, i.id`,
    [cart.id]
  );

  const optionIds = [...new Set(lineRes.rows.flatMap((row: any) => row.selected_option_ids ?? []))];
  const optionRes = optionIds.length
    ? await client.query(
        `SELECT id, name, price_paise FROM modifier_options WHERE id = ANY($1::uuid[])`,
        [optionIds]
      )
    : { rows: [] as any[] };
  const optionById = new Map(optionRes.rows.map((row: any) => [row.id, row]));

  const status = effectiveStatus(cart.status, cart.expires_at as Date);
  const isHost = cart.host_user_id === viewerId;
  const isParticipant = memberRes.rows.some((row: any) => row.user_id === viewerId);

  const lines: GroupCartLine[] = lineRes.rows.map((row: any) => {
    const selectedOptions: GroupCartOption[] = (row.selected_option_ids ?? [])
      .map((id: string) => optionById.get(id))
      .filter(Boolean)
      .map((option: any) => ({ id: option.id, name: option.name, pricePaise: option.price_paise }));
    const basePricePaise = row.variant_price ?? row.item_price;
    const unitPricePaise = basePricePaise + selectedOptions.reduce((sum, option) => sum + option.pricePaise, 0);
    return {
      id: row.id,
      participantId: row.participant_user_id,
      participantName: row.participant_name,
      menuItemId: row.menu_item_id,
      name: row.name,
      variantId: row.variant_id ?? undefined,
      variantName: row.variant_name ?? undefined,
      basePricePaise,
      selectedOptions,
      unitPricePaise,
      quantity: row.quantity,
      lineTotalPaise: unitPricePaise * row.quantity,
      notes: row.notes ?? undefined,
      imageUrl: row.image_url ?? undefined,
      isVeg: row.dietary_tag === "VEG" || row.dietary_tag === "VEGAN",
      canEdit: status === "OPEN" && (isHost || row.participant_user_id === viewerId),
    };
  });

  const participants: GroupCartParticipant[] = memberRes.rows.map((member: any) => {
    const own = lines.filter((line) => line.participantId === member.user_id);
    return {
      userId: member.user_id,
      name: member.name,
      isHost: member.user_id === cart.host_user_id,
      itemCount: own.reduce((sum, line) => sum + line.quantity, 0),
      subtotalPaise: own.reduce((sum, line) => sum + line.lineTotalPaise, 0),
    };
  });
  if (!participants.some((participant) => participant.userId === cart.host_user_id)) {
    participants.unshift({
      userId: cart.host_user_id,
      name: cart.host_name,
      isHost: true,
      itemCount: 0,
      subtotalPaise: 0,
    });
  }

  return {
    id: cart.id,
    code: cart.code,
    status,
    restaurantId: cart.restaurant_id,
    restaurantName: cart.restaurant_name,
    restaurantSlug: cart.restaurant_slug,
    hostId: cart.host_user_id,
    hostName: cart.host_name,
    viewerId,
    orderId: cart.order_id ?? undefined,
    expiresAt: (cart.expires_at as Date).toISOString(),
    createdAt: (cart.created_at as Date).toISOString(),
    isHost,
    isParticipant,
    participants,
    lines,
    participantCount: participants.length,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotalPaise: lines.reduce((sum, line) => sum + line.lineTotalPaise, 0),
  };
}

async function lockedCartForUpdate(client: any, code: string): Promise<any> {
  const res = await client.query(`SELECT * FROM group_carts WHERE code = $1 FOR UPDATE`, [code.toUpperCase()]);
  const cart = res.rows[0];
  if (!cart) throw new DomainError("NOT_FOUND", "Group order not found");
  return cart;
}

function assertOpen(cart: any) {
  if (cart.status === "COMPLETED") throw new DomainError("STATE_CONFLICT", "This group order is already placed.");
  if (cart.status === "ABANDONED" || (cart.status === "OPEN" && cart.expires_at.getTime() < Date.now())) {
    throw new DomainError("STATE_CONFLICT", "This group order has expired. Ask the host to start a new one.");
  }
  if (cart.status !== "OPEN") throw new DomainError("STATE_CONFLICT", "The host has locked this group order.");
}

export class GroupCartRepository {
  static async create(input: { hostUserId: string; restaurantId: string }): Promise<GroupCart> {
    const restaurant = await getDbPool().query(`SELECT id FROM restaurants WHERE id = $1`, [input.restaurantId]);
    if (!restaurant.rows[0]) throw new DomainError("NOT_FOUND", "Restaurant not found");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const created = await withTransaction(async (client) => {
          const res = await client.query(
            `INSERT INTO group_carts (code, host_user_id, restaurant_id)
             VALUES ($1, $2, $3) RETURNING *`,
            [generateCode(), input.hostUserId, input.restaurantId]
          );
          await client.query(
            `INSERT INTO group_cart_members (group_cart_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [res.rows[0].id, input.hostUserId]
          );
          return res.rows[0];
        });
        return (await loadCart(getDbPool(), created.code, input.hostUserId))!;
      } catch (err) {
        if ((err as { code?: string }).code !== "23505" || attempt === 4) throw err;
      }
    }
    throw new DomainError("INTERNAL_ERROR", "Could not start a group order");
  }

  /** Viewing a link joins the group, so the roster is complete even before someone adds a dish. */
  static async get(code: string, viewerId: string): Promise<GroupCart> {
    return withTransaction(async (client) => {
      const cart = await lockedCartForUpdate(client, code);
      if (cart.status === "OPEN" && cart.expires_at.getTime() >= Date.now()) {
        const members = await client.query(`SELECT COUNT(*)::int AS count FROM group_cart_members WHERE group_cart_id = $1`, [
          cart.id,
        ]);
        const already = await client.query(
          `SELECT 1 FROM group_cart_members WHERE group_cart_id = $1 AND user_id = $2`,
          [cart.id, viewerId]
        );
        if (!already.rows[0] && members.rows[0].count >= MAX_MEMBERS) {
          throw new DomainError("STATE_CONFLICT", `This group is full (${MAX_MEMBERS} people).`);
        }
        await client.query(
          `INSERT INTO group_cart_members (group_cart_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [cart.id, viewerId]
        );
      }
      const loaded = await loadCart(client, code, viewerId);
      if (!loaded) throw new DomainError("NOT_FOUND", "Group order not found");
      return loaded;
    });
  }

  static async addItem(input: {
    code: string;
    userId: string;
    menuItemId: string;
    variantId?: string;
    selectedOptionIds?: string[];
    quantity: number;
    notes?: string;
  }): Promise<GroupCart> {
    const optionIds = [...new Set(input.selectedOptionIds ?? [])].sort();
    return withTransaction(async (client) => {
      const cart = await lockedCartForUpdate(client, input.code);
      assertOpen(cart);

      const member = await client.query(
        `SELECT 1 FROM group_cart_members WHERE group_cart_id = $1 AND user_id = $2`,
        [cart.id, input.userId]
      );
      if (!member.rows[0]) {
        const members = await client.query(`SELECT COUNT(*)::int AS count FROM group_cart_members WHERE group_cart_id = $1`, [
          cart.id,
        ]);
        if (members.rows[0].count >= MAX_MEMBERS) {
          throw new DomainError("STATE_CONFLICT", `This group is full (${MAX_MEMBERS} people).`);
        }
        await client.query(`INSERT INTO group_cart_members (group_cart_id, user_id) VALUES ($1, $2)`, [
          cart.id,
          input.userId,
        ]);
      }

      const itemRes = await client.query(
        `SELECT id, restaurant_id, price_paise, is_available FROM menu_items WHERE id = $1`,
        [input.menuItemId]
      );
      const item = itemRes.rows[0];
      if (!item || item.restaurant_id !== cart.restaurant_id) {
        throw new DomainError("NOT_FOUND", "That dish is not on this restaurant's menu");
      }
      if (!item.is_available) throw new DomainError("STATE_CONFLICT", "That dish is sold out");

      const variantRes = await client.query(
        `SELECT id, price_paise, is_available FROM item_variants WHERE menu_item_id = $1`,
        [item.id]
      );
      let basePricePaise = item.price_paise;
      if (variantRes.rows.length > 0) {
        if (!input.variantId) throw new DomainError("VALIDATION_ERROR", "Choose a portion size");
        const variant = variantRes.rows.find((row: any) => row.id === input.variantId);
        if (!variant) throw new DomainError("VALIDATION_ERROR", "That portion is not available for this dish");
        if (!variant.is_available) throw new DomainError("STATE_CONFLICT", "That portion is sold out");
        basePricePaise = variant.price_paise;
      } else if (input.variantId) {
        throw new DomainError("VALIDATION_ERROR", "That portion is not available for this dish");
      }

      const optionRes = optionIds.length
        ? await client.query(
            `SELECT o.id, o.price_paise, g.id AS group_id, g.is_required, g.min_select
               FROM modifier_options o
               JOIN modifier_groups g ON g.id = o.group_id
              WHERE g.menu_item_id = $1 AND o.id = ANY($2::uuid[])`,
            [item.id, optionIds]
          )
        : { rows: [] as any[] };
      if (optionRes.rows.length !== optionIds.length) {
        throw new DomainError("VALIDATION_ERROR", "One of the chosen extras is not available for this dish");
      }
      // Mirror the quote validator: required groups must meet their minimum selection.
      const groupsRes = await client.query(
        `SELECT id, is_required, min_select FROM modifier_groups WHERE menu_item_id = $1`,
        [item.id]
      );
      for (const group of groupsRes.rows) {
        const chosen = optionRes.rows.filter((row: any) => row.group_id === group.id).length;
        const min = group.is_required ? Math.max(1, group.min_select) : group.min_select;
        if ((group.is_required || chosen > 0) && chosen < min) {
          throw new DomainError("VALIDATION_ERROR", "Choose the required extras for that dish");
        }
      }

      const lines = await client.query(
        `SELECT COUNT(*)::int AS count FROM group_cart_items WHERE group_cart_id = $1`,
        [cart.id]
      );
      if (lines.rows[0].count >= MAX_LINES) throw new DomainError("STATE_CONFLICT", "This group cart is full");

      const existing = await client.query(
        `SELECT id, quantity FROM group_cart_items
          WHERE group_cart_id = $1 AND participant_user_id = $2 AND menu_item_id = $3
            AND variant_id IS NOT DISTINCT FROM $4::uuid
            AND selected_option_ids = $5::uuid[]
            AND notes IS NOT DISTINCT FROM $6
          LIMIT 1`,
        [cart.id, input.userId, item.id, input.variantId ?? null, optionIds, input.notes?.trim() || null]
      );
      const unitPricePaise =
        basePricePaise + optionRes.rows.reduce((sum: number, row: any) => sum + row.price_paise, 0);
      if (existing.rows[0]) {
        const quantity = existing.rows[0].quantity + input.quantity;
        if (quantity > 20) throw new DomainError("VALIDATION_ERROR", "You can add up to 20 of an item.");
        await client.query(`UPDATE group_cart_items SET quantity = $2, updated_at = NOW() WHERE id = $1`, [
          existing.rows[0].id,
          quantity,
        ]);
      } else {
        await client.query(
          `INSERT INTO group_cart_items
             (group_cart_id, participant_user_id, menu_item_id, variant_id, selected_option_ids, quantity, notes, unit_price_paise)
           VALUES ($1, $2, $3, $4, $5::uuid[], $6, $7, $8)`,
          [
            cart.id,
            input.userId,
            item.id,
            input.variantId ?? null,
            optionIds,
            input.quantity,
            input.notes?.trim() || null,
            unitPricePaise,
          ]
        );
      }
      await client.query(`UPDATE group_carts SET updated_at = NOW() WHERE id = $1`, [cart.id]);
      return (await loadCart(client, input.code, input.userId))!;
    });
  }

  static async updateItem(input: {
    code: string;
    userId: string;
    itemId: string;
    quantity: number;
  }): Promise<GroupCart> {
    return withTransaction(async (client) => {
      const cart = await lockedCartForUpdate(client, input.code);
      assertOpen(cart);
      const itemRes = await client.query(`SELECT * FROM group_cart_items WHERE id = $1 AND group_cart_id = $2`, [
        input.itemId,
        cart.id,
      ]);
      const item = itemRes.rows[0];
      if (!item) throw new DomainError("NOT_FOUND", "Item not found in this group order");
      if (item.participant_user_id !== input.userId && cart.host_user_id !== input.userId) {
        throw new DomainError("FORBIDDEN", "You can only change your own dishes");
      }
      if (input.quantity <= 0) {
        await client.query(`DELETE FROM group_cart_items WHERE id = $1`, [item.id]);
      } else {
        await client.query(`UPDATE group_cart_items SET quantity = $2, updated_at = NOW() WHERE id = $1`, [
          item.id,
          Math.min(20, input.quantity),
        ]);
      }
      await client.query(`UPDATE group_carts SET updated_at = NOW() WHERE id = $1`, [cart.id]);
      return (await loadCart(client, input.code, input.userId))!;
    });
  }

  static async removeItem(input: { code: string; userId: string; itemId: string }): Promise<GroupCart> {
    return GroupCartRepository.updateItem({ ...input, quantity: 0 });
  }

  static async lock(code: string, hostId: string): Promise<GroupCart> {
    return withTransaction(async (client) => {
      const cart = await lockedCartForUpdate(client, code);
      if (cart.host_user_id !== hostId) throw new DomainError("FORBIDDEN", "Only the host can lock the group order");
      if (cart.status === "COMPLETED") throw new DomainError("STATE_CONFLICT", "This group order is already placed.");
      if (cart.status === "ABANDONED" || cart.expires_at.getTime() < Date.now()) {
        throw new DomainError("STATE_CONFLICT", "This group order has expired.");
      }
      const count = await client.query(`SELECT COUNT(*)::int AS count FROM group_cart_items WHERE group_cart_id = $1`, [
        cart.id,
      ]);
      if (count.rows[0].count === 0) throw new DomainError("VALIDATION_ERROR", "Add at least one dish before checkout");
      await client.query(`UPDATE group_carts SET status = 'LOCKED', updated_at = NOW() WHERE id = $1`, [cart.id]);
      return (await loadCart(client, code, hostId))!;
    });
  }

  static async reopen(code: string, hostId: string): Promise<GroupCart> {
    return withTransaction(async (client) => {
      const cart = await lockedCartForUpdate(client, code);
      if (cart.host_user_id !== hostId) throw new DomainError("FORBIDDEN", "Only the host can reopen the group order");
      if (cart.status !== "LOCKED") throw new DomainError("STATE_CONFLICT", "Only a locked group order can be reopened.");
      await client.query(`UPDATE group_carts SET status = 'OPEN', updated_at = NOW() WHERE id = $1`, [cart.id]);
      return (await loadCart(client, code, hostId))!;
    });
  }

  static async complete(input: { code: string; hostId: string; orderId: string }): Promise<GroupCart> {
    return withTransaction(async (client) => {
      const cart = await lockedCartForUpdate(client, input.code);
      if (cart.host_user_id !== input.hostId) throw new DomainError("FORBIDDEN", "Only the host can complete the group order");
      if (cart.status === "COMPLETED") {
        if (cart.order_id === input.orderId) return (await loadCart(client, input.code, input.hostId))!;
        throw new DomainError("STATE_CONFLICT", "This group order is already placed.");
      }
      if (cart.status === "ABANDONED") throw new DomainError("STATE_CONFLICT", "This group order has expired.");
      const order = await client.query(`SELECT id, customer_id FROM orders WHERE id = $1`, [input.orderId]);
      if (!order.rows[0] || order.rows[0].customer_id !== input.hostId) {
        throw new DomainError("NOT_FOUND", "Order not found");
      }
      await client.query(
        `UPDATE group_carts SET status = 'COMPLETED', order_id = $2, updated_at = NOW() WHERE id = $1`,
        [cart.id, input.orderId]
      );
      return (await loadCart(client, input.code, input.hostId))!;
    });
  }
}
