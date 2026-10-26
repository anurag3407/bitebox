import { z } from "zod";
import { UserRole } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { AuditRepository, RiderEquipmentRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, parseBody, parseQuery, route } from "@/server/route";

const Query = z.object({ riderId: z.string().uuid() });
const Update = z.object({
  itemType: z.enum(["HELMET", "DELIVERY_BAG", "T_SHIRT", "INSURANCE_CARD"]),
  status: z.enum(["RETURNED", "LOST", "RENEWED"]),
  chargeRider: z.boolean().optional(),
});

export const GET = route<{ riderId: string }>(async (req, _ctx, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const { riderId } = parseQuery(req, Query);
  const equipment = await RiderEquipmentRepository.listForRider(riderId);
  return apiSuccess({ equipment }, 200, { requestId });
});

export const PATCH = route<{ riderId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req, [UserRole.ADMIN]);
  const riderId = assertUuid((await params).riderId, "rider");
  const body = await parseBody(req, Update);

  let equipment;
  if (body.status === "RENEWED") {
    equipment = await RiderEquipmentRepository.renew({
      riderId,
      itemType: body.itemType,
      adminId: auth.user.id,
    });
  } else {
    equipment = await RiderEquipmentRepository.markStatus({
      riderId,
      itemType: body.itemType,
      status: body.status,
      chargeRider: body.chargeRider,
      adminId: auth.user.id,
    });
  }

  if (!equipment) throw new DomainError("NOT_FOUND", "This kit item has not been issued");

  await AuditRepository.log({
    adminUserId: auth.user.id,
    action: `RIDER_KIT_${body.status}`,
    targetType: "rider",
    targetId: riderId,
    details: {
      itemType: body.itemType,
      chargeRider: body.chargeRider,
      replacementFeePaise: equipment.replacementFeePaise,
    },
  });

  return apiSuccess({ equipment }, 200, { requestId });
});
