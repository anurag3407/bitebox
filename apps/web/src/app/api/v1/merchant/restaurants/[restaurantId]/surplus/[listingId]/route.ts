import { z } from "zod";
import { UserRole } from "@startup/contracts";
import { SurplusRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { StaffPermission, requireAuth, requireRestaurantAccess } from "@/server/auth-guard";
import { assertUuid, parseBody, route } from "@/server/route";

const Update = z.object({ status: z.enum(["ACTIVE", "CANCELLED"]) });

export const PATCH = route<{ restaurantId: string; listingId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req, [UserRole.MERCHANT_STAFF, UserRole.ADMIN]);
  const restaurantId = assertUuid((await params).restaurantId, "restaurant");
  if (auth.role === UserRole.MERCHANT_STAFF) {
    await requireRestaurantAccess(auth, restaurantId, StaffPermission.MANAGE_OUTLET);
  }
  const listingId = assertUuid((await params).listingId, "rescue bag");
  const body = await parseBody(req, Update);
  const listing = await SurplusRepository.setListingStatus({
    listingId,
    restaurantId,
    status: body.status,
  });
  return apiSuccess(
    {
      listing: {
        id: listing.id,
        status: listing.status,
        quantityAvailable: listing.quantity_available,
      },
    },
    200,
    { requestId }
  );
});
