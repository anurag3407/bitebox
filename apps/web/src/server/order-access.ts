import { OrderDetailDto, UserRole } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { OrderRepository, RestaurantRepository } from "@startup/database";
import { AuthContext } from "./auth-guard";

export type OrderViewer = "CUSTOMER" | "MERCHANT" | "RIDER" | "ADMIN";

/**
 * Decides how (if at all) the caller may see an order. Unrelated callers get
 * NOT_FOUND rather than FORBIDDEN so order ids cannot be probed.
 */
export async function resolveOrderViewer(ctx: AuthContext, orderId: string): Promise<OrderViewer> {
  const access = await OrderRepository.findAccessContext(orderId);
  if (!access) throw new DomainError("NOT_FOUND", "Order not found");

  if (ctx.role === UserRole.ADMIN) return "ADMIN";
  if (access.customerId === ctx.user.id) return "CUSTOMER";
  if (ctx.role === UserRole.MERCHANT_STAFF) {
    const membership = await RestaurantRepository.getMembership(ctx.user.id, access.restaurantId);
    if (membership) return "MERCHANT";
  }
  if (ctx.role === UserRole.RIDER && access.riderUserIds.includes(ctx.user.id)) return "RIDER";
  throw new DomainError("NOT_FOUND", "Order not found");
}

/** Removes fields a viewer must not see (proof codes, contact details). */
export function shapeOrderForViewer(order: OrderDetailDto, viewer: OrderViewer): OrderDetailDto {
  switch (viewer) {
    case "ADMIN":
      return order;
    case "CUSTOMER": {
      // The pickup code is the restaurant's proof of handover
      const { pickupCode: _p, customerId: _c, ...rest } = order;
      return { ...rest, rider: rest.rider ? { ...rest.rider, phone: undefined } : undefined };
    }
    case "MERCHANT": {
      const { deliveryOtp: _d, customerId: _c, ...rest } = order;
      return { ...rest, deliveryAddress: { ...rest.deliveryAddress, contactPhone: undefined } };
    }
    case "RIDER": {
      const { deliveryOtp: _d, pickupCode: _p, customerId: _c, breakdown, ...rest } = order;
      // Riders see what to collect/deliver, not the customer's bill or number (calls are bridged)
      return {
        ...rest,
        breakdown: { ...breakdown, discountPaise: 0 },
        deliveryAddress: { ...rest.deliveryAddress, contactPhone: undefined },
      };
    }
  }
}
