import { DomainError } from "@startup/core";
import { OrderRepository, RestaurantRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { CacheKeys, cached } from "@/server/cache";
import { assertUuid, route } from "@/server/route";

/**
 * Rebuilds a cart from a past order against today's menu: current prices, items
 * that are gone or sold out reported separately instead of silently dropped.
 */
export const GET = route<{ orderId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  const orderId = assertUuid((await params).orderId, "order");
  const order = await OrderRepository.findById(orderId);
  if (!order || order.customerId !== auth.user.id) throw new DomainError("NOT_FOUND", "Order not found");

  const restaurant = await RestaurantRepository.findById(order.restaurant.id);
  if (!restaurant) throw new DomainError("NOT_FOUND", "Restaurant no longer available");
  const menu = await cached(CacheKeys.menu(restaurant.slug), 30, () => RestaurantRepository.findBySlug(restaurant.slug));
  if (!menu) throw new DomainError("NOT_FOUND", "Restaurant no longer available");

  const items = menu.categories.flatMap((c) => c.items);
  const lines: unknown[] = [];
  const unavailable: string[] = [];

  for (const past of order.items) {
    const item = items.find((i) => i.id === past.menuItemId);
    if (!item || !item.isAvailable) {
      unavailable.push(past.name);
      continue;
    }
    const variant = past.variantName ? item.variants.find((v) => v.name === past.variantName && v.isAvailable) : undefined;
    if (past.variantName && !variant) {
      unavailable.push(`${past.name} (${past.variantName})`);
      continue;
    }
    const options = item.modifierGroups.flatMap((g) => g.options).filter((o) => past.selectedOptionNames.includes(o.name));
    if (options.length !== past.selectedOptionNames.length || options.some((o) => !o.isAvailable)) {
      unavailable.push(`${past.name} (customisation changed)`);
      continue;
    }
    lines.push({
      menuItemId: item.id,
      name: item.name,
      variantId: variant?.id,
      variantName: variant?.name,
      selectedOptions: options,
      basePricePaise: variant?.pricePaise ?? item.pricePaise,
      quantity: past.quantity,
      instructions: past.instructions,
      imageUrl: item.imageUrl,
    });
  }

  return apiSuccess(
    {
      restaurant: { id: menu.id, name: menu.name, slug: menu.slug, isAcceptingOrders: menu.isAcceptingOrders },
      lines,
      unavailable,
    },
    200,
    { requestId }
  );
});
