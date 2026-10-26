import { z } from "zod";
import { UserRole } from "@startup/contracts";
import { AuditRepository, RiderEquipmentRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseBody, route } from "@/server/route";

const Issue = z.object({
  riderId: z.string().uuid(),
  itemType: z.enum(["HELMET", "DELIVERY_BAG", "T_SHIRT", "INSURANCE_CARD"]),
  size: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(300).optional(),
});

export const POST = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req, [UserRole.ADMIN]);
  const body = await parseBody(req, Issue);
  const equipment = await RiderEquipmentRepository.issue({ ...body, adminId: auth.user.id });
  await AuditRepository.log({
    adminUserId: auth.user.id,
    action: "RIDER_KIT_ISSUED",
    targetType: "rider",
    targetId: body.riderId,
    details: { itemType: body.itemType, size: body.size },
  });
  return apiSuccess({ equipment }, 201, { requestId });
});
