import { AdminUpdateUserSchema, UserRole } from "@startup/contracts";
import { AdminUserRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, parseBody, route } from "@/server/route";

export const PATCH = route<{ userId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req, [UserRole.ADMIN]);
  const userId = assertUuid((await params).userId, "user");
  const body = await parseBody(req, AdminUpdateUserSchema);
  await AdminUserRepository.update({ userId, adminId: auth.user.id, role: body.role as UserRole | undefined, isActive: body.isActive, reason: body.reason });
  return apiSuccess({ success: true }, 200, { requestId });
});
