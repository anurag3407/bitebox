import { z } from "zod";
import { UserRole } from "@startup/contracts";
import { DomainError, priceSurplusBag } from "@startup/core";
import { SurplusRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { StaffPermission, requireAuth, requireRestaurantAccess } from "@/server/auth-guard";
import { assertUuid, parseBody, route } from "@/server/route";

const CreateListing = z.object({
  title: z.string().trim().min(3).max(120),
  originalValuePaise: z.number().int().min(5000).max(500000),
  discountBp: z.number().int().min(1000).max(8000),
  platformFlatFeePaise: z.number().int().min(0).max(10000),
  quantity: z.number().int().min(1).max(100),
  pickupWindowStart: z.string().datetime(),
  pickupWindowEnd: z.string().datetime(),
});

function mapListing(l: any) {
  return {
    id: l.id,
    title: l.title,
    originalValuePaise: l.original_value_paise,
    salePricePaise: l.sale_price_paise,
    platformFlatFeePaise: l.platform_flat_fee_paise,
    quantityAvailable: l.quantity_available,
    pickupWindowStart: (l.pickup_window_start as Date).toISOString(),
    pickupWindowEnd: (l.pickup_window_end as Date).toISOString(),
    status: l.status,
    soldCount: Number(l.sold_count ?? 0),
    createdAt: (l.created_at as Date).toISOString(),
  };
}

export const GET = route<{ restaurantId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req, [UserRole.MERCHANT_STAFF, UserRole.ADMIN]);
  const restaurantId = assertUuid((await params).restaurantId, "restaurant");
  if (auth.role === UserRole.MERCHANT_STAFF) {
    await requireRestaurantAccess(auth, restaurantId, StaffPermission.MANAGE_OUTLET);
  }
  const listings = await SurplusRepository.listForRestaurant(restaurantId);
  return apiSuccess({ listings: listings.map(mapListing) }, 200, { requestId });
});

export const POST = route<{ restaurantId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req, [UserRole.MERCHANT_STAFF, UserRole.ADMIN]);
  const restaurantId = assertUuid((await params).restaurantId, "restaurant");
  if (auth.role === UserRole.MERCHANT_STAFF) {
    await requireRestaurantAccess(auth, restaurantId, StaffPermission.MANAGE_OUTLET);
  }
  const body = await parseBody(req, CreateListing);
  const start = new Date(body.pickupWindowStart);
  const end = new Date(body.pickupWindowEnd);
  if (end.getTime() <= start.getTime()) throw new DomainError("VALIDATION_ERROR", "Pickup window must end after it starts");
  if (start.getTime() < Date.now() - 5 * 60 * 1000) throw new DomainError("VALIDATION_ERROR", "Pickup window cannot start in the past");
  const priced = priceSurplusBag({
    originalValuePaise: body.originalValuePaise,
    platformFlatFeePaise: body.platformFlatFeePaise,
    discountBp: body.discountBp,
  });
  if (priced.merchantProceedsPaise <= 0) {
    throw new DomainError("VALIDATION_ERROR", "The platform fee is too high for this bag");
  }
  const result = await SurplusRepository.createListing({
    restaurantId,
    title: body.title,
    originalValuePaise: body.originalValuePaise,
    discountBp: body.discountBp,
    platformFlatFeePaise: body.platformFlatFeePaise,
    quantity: body.quantity,
    pickupWindowStart: start,
    pickupWindowEnd: end,
  });
  return apiSuccess({ listing: mapListing(result.listing), priced: result.priced }, 201, { requestId });
});
