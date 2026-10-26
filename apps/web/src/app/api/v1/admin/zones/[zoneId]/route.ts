import { z } from "zod";
import { UserRole } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { AuditRepository, BatchRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, parseBody, route } from "@/server/route";

const UpdateZone = z.object({ isActive: z.boolean() });

export const PATCH = route<{ zoneId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req, [UserRole.ADMIN]);
  const zoneId = assertUuid((await params).zoneId, "zone");
  const body = await parseBody(req, UpdateZone);
  const zone = await BatchRepository.updateClusterActive(zoneId, body.isActive);
  if (!zone) throw new DomainError("NOT_FOUND", "Zone not found");
  await AuditRepository.log({
    adminUserId: auth.user.id,
    action: body.isActive ? "ZONE_ACTIVATED" : "ZONE_PAUSED",
    targetType: "cluster",
    targetId: zoneId,
  });
  return apiSuccess({ zone: { id: zone.id, name: zone.name, isActive: zone.is_active } }, 200, { requestId });
});
