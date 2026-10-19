import { NextRequest } from "next/server";
import { RestaurantRepository } from "@startup/database";
import { apiError, apiSuccess } from "@/server/api-response";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const pureVeg = searchParams.get("pureVeg") === "true";
    const cuisine = searchParams.get("cuisine") || undefined;

    const list = await RestaurantRepository.listSummaries({
      pureVeg,
      cuisine,
      limit: 20,
    });

    return apiSuccess(list);
  } catch (err: any) {
    return apiError("INTERNAL_ERROR", err.message || "Failed to fetch restaurants", 500);
  }
}
