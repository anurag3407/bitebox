import { UserRole } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { getDbPool } from "@startup/database";
import { AuthContext } from "./auth-guard";
import { OrderViewer } from "./order-access";

export type CallTarget = "RIDER" | "CUSTOMER" | "RESTAURANT";

const ACTIVE_TRIP = ["ASSIGNED", "AT_PICKUP", "PICKED_UP", "AT_DROPOFF"];

/**
 * Who may call whom about an order, and the two numbers to bridge. Numbers are read here
 * on the server only; they are never returned to the caller when telephony is configured.
 */
export async function resolveCallParties(
  ctx: AuthContext,
  viewer: OrderViewer,
  orderId: string,
  target: CallTarget
): Promise<{ fromPhone: string | null; toPhone: string | null }> {
  const res = await getDbPool().query(
    `SELECT o.fulfillment_state, o.delivered_at, o.cancelled_at,
            COALESCE(o.delivery_address_snapshot->>'contactPhone', cu.phone) AS customer_phone,
            r.phone AS restaurant_phone,
            rd.phone AS rider_phone, rd.user_id AS rider_user_id, da.status AS trip_status
       FROM orders o
       JOIN restaurants r ON r.id = o.restaurant_id
       JOIN app_users cu ON cu.id = o.customer_id
       LEFT JOIN LATERAL (SELECT rider_id, status FROM delivery_assignments
                           WHERE order_id = o.id AND status <> 'CANCELLED' ORDER BY assigned_at DESC LIMIT 1) da ON true
       LEFT JOIN riders rd ON rd.id = da.rider_id
      WHERE o.id = $1`,
    [orderId]
  );
  const o = res.rows[0];
  if (!o) throw new DomainError("NOT_FOUND", "Order not found");

  const tripActive = ACTIVE_TRIP.includes(o.trip_status);
  const finishedAt: Date | null = o.delivered_at ?? o.cancelled_at;
  const recentlyFinished = !finishedAt || Date.now() - finishedAt.getTime() < 2 * 60 * 60 * 1000;

  const deny = (msg: string) => {
    throw new DomainError("FORBIDDEN", msg);
  };
  const phones: Record<CallTarget, string | null> = {
    RIDER: o.rider_phone,
    CUSTOMER: o.customer_phone,
    RESTAURANT: o.restaurant_phone,
  };

  let fromPhone: string | null;
  switch (viewer) {
    case "CUSTOMER":
      if (target === "CUSTOMER") deny("Choose who to call");
      if (target === "RIDER" && !tripActive) deny("You can call the delivery partner while your order is on its way.");
      if (target === "RESTAURANT" && !recentlyFinished) deny("Please use Help for older orders.");
      fromPhone = o.customer_phone ?? ctx.user.phone;
      break;
    case "RIDER":
      if (o.rider_user_id !== ctx.user.id || !tripActive) deny("Calling is available during your active trip.");
      if (target === "RIDER") deny("Choose who to call");
      fromPhone = o.rider_phone;
      break;
    case "MERCHANT":
      if (target === "RESTAURANT") deny("Choose who to call");
      if (target === "RIDER" && !tripActive) deny("No delivery partner is on this order yet.");
      if (target === "CUSTOMER" && !recentlyFinished) deny("This order is closed.");
      fromPhone = o.restaurant_phone;
      break;
    case "ADMIN":
      fromPhone = ctx.user.phone;
      break;
  }
  if (ctx.role === UserRole.ADMIN && viewer !== "ADMIN") fromPhone = ctx.user.phone;
  return { fromPhone, toPhone: phones[target] };
}
