import { z } from "zod";
import { UserRole } from "@startup/contracts";
import { AuditRepository, BatchRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, parseBody, route } from "@/server/route";

const CreateDropPoint = z.object({
  name: z.string().trim().min(2).max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const POST = route<{ zoneId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req, [UserRole.ADMIN]);
  const zoneId = assertUuid((await params).zoneId, "zone");
  const body = await parseBody(req, CreateDropPoint);
  const dropPoint = await BatchRepository.createDropPoint({ clusterId: zoneId, ...body });
  await AuditRepository.log({
    adminUserId: auth.user.id,
    action: "DROP_POINT_CREATED",
    targetType: "drop_point",
    targetId: dropPoint.id,
    details: { clusterId: zoneId, name: body.name },
  });
  return apiSuccess({ dropPoint: { id: dropPoint.id, name: dropPoint.name } }, 201, { requestId });
});
