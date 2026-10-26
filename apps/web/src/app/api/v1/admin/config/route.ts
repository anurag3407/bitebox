import { z } from "zod";
import { UserRole } from "@startup/contracts";
import { AuditRepository, PlatformConfigRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseBody, route } from "@/server/route";

const UpdateConfig = z.object({
  settings: z.record(z.any()),
});

export const GET = route(async (req, _ctx, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const entries = await PlatformConfigRepository.getAllEntries();
  const settings = await PlatformConfigRepository.getAll();
  return apiSuccess({ settings, entries }, 200, { requestId });
});

export const PUT = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req, [UserRole.ADMIN]);
  const body = await parseBody(req, UpdateConfig);
  await PlatformConfigRepository.setMany(body.settings, auth.user.id);
  await AuditRepository.log({
    adminUserId: auth.user.id,
    action: "PLATFORM_CONFIG_UPDATED",
    targetType: "system",
    targetId: "platform_config",
    details: { updatedKeys: Object.keys(body.settings) },
  });
  const settings = await PlatformConfigRepository.getAll();
  return apiSuccess({ settings }, 200, { requestId });
});
