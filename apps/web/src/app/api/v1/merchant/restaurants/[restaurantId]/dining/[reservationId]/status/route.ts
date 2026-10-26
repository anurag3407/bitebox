import { UpdateDiningReservationSchema } from "@startup/contracts";
import { DiningRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { StaffPermission } from "@/server/auth-guard";
import { authorizeRestaurant } from "@/server/merchant-catalog";
import { assertUuid, parseBody, route } from "@/server/route";

export const POST = route<{ restaurantId: string; reservationId: string }>(async (req, { params }, requestId) => {
  const { restaurantId } = await authorizeRestaurant(req, params, StaffPermission.OPERATE);
  const reservationId = assertUuid((await params).reservationId, "reservation");
  const { status } = await parseBody(req, UpdateDiningReservationSchema);
  return apiSuccess(await DiningRepository.updateStatus(restaurantId, reservationId, status), 200, { requestId });
});
