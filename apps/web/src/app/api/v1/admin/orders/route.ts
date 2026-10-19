import { NextRequest } from "next/server";
import { getDb, orders, restaurants, customerAddresses, payments, refunds } from "@startup/database";
import { apiError, apiSuccess } from "@/server/api-response";
import { desc, eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const rows = await db
      .select({
        order: orders,
        restaurant: restaurants,
        address: customerAddresses,
      })
      .from(orders)
      .innerJoin(restaurants, eq(orders.restaurantId, restaurants.id))
      .innerJoin(customerAddresses, eq(orders.deliveryAddressId, customerAddresses.id))
      .orderBy(desc(orders.createdAt))
      .limit(50);

    return apiSuccess(
      rows.map((r) => ({
        orderId: r.order.id,
        orderNumber: r.order.orderNumber,
        restaurantName: r.restaurant.name,
        customerAddress: `${r.address.building}, ${r.address.street}`,
        fulfillmentState: r.order.fulfillmentState,
        paymentStatus: r.order.paymentStatus,
        payablePaise: r.order.payablePaise,
        createdAt: r.order.createdAt.toISOString(),
      }))
    );
  } catch (err: any) {
    return apiError("INTERNAL_ERROR", err.message || "Failed to fetch admin orders", 500);
  }
}
