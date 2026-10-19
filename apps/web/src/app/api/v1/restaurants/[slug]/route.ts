import { NextRequest } from "next/server";
import { RestaurantRepository } from "@startup/database";
import { apiError, apiSuccess } from "@/server/api-response";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const detail = await RestaurantRepository.findBySlug(slug);
    if (!detail) {
      return apiError("NOT_FOUND", `Restaurant with slug "${slug}" not found`, 404);
    }
    return apiSuccess(detail);
  } catch (err: any) {
    return apiError("INTERNAL_ERROR", err.message || "Failed to fetch restaurant", 500);
  }
}
