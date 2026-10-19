import { NextRequest } from "next/server";
import { OrderRepository } from "@startup/database";
import { apiError, apiSuccess } from "@/server/api-response";
import { getAuthenticatedActor, getOrCreateDbUser } from "@/server/auth-guard";

export async function GET(req: NextRequest) {
  try {
    const actor = await getAuthenticatedActor(req);
    if (!actor) {
      return apiError("UNAUTHENTICATED", "Authentication required", 401);
    }

    const user = await getOrCreateDbUser(actor);
    const orders = await OrderRepository.listByCustomer(user.id);
    return apiSuccess(orders);
  } catch (err: any) {
    return apiError("INTERNAL_ERROR", err.message || "Failed to list orders", 500);
  }
}
