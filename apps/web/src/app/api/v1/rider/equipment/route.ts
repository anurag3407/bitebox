import { z } from "zod";
import { RiderEquipmentRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth, requireRiderProfile } from "@/server/auth-guard";
import { parseBody, route } from "@/server/route";

const RenewRequest = z.object({
  itemType: z.enum(["HELMET", "DELIVERY_BAG", "T_SHIRT", "INSURANCE_CARD"]),
});

export const GET = route(async (req, _ctx, requestId) => {
  const rider = await requireRiderProfile(await requireAuth(req));
  const equipment = await RiderEquipmentRepository.listForRider(rider.id);
  return apiSuccess({ equipment }, 200, { requestId });
});

export const POST = route(async (req, _ctx, requestId) => {
  const rider = await requireRiderProfile(await requireAuth(req));
  const body = await parseBody(req, RenewRequest);
  const equipment = await RiderEquipmentRepository.renew({
    riderId: rider.id,
    itemType: body.itemType,
  });
  return apiSuccess({ equipment, scheduled: true }, 200, { requestId });
});
