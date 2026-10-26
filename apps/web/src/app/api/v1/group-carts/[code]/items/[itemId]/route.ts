import { UpdateGroupCartItemRequestSchema } from "@startup/contracts";
import { GroupCartRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, parseBody, route } from "@/server/route";

export const PATCH = route<{ code: string; itemId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  const { code, itemId } = await params;
  const body = await parseBody(req, UpdateGroupCartItemRequestSchema);
  const groupCart = await GroupCartRepository.updateItem({
    code,
    userId: auth.user.id,
    itemId: assertUuid(itemId, "group cart item"),
    quantity: body.quantity,
  });
  return apiSuccess({ groupCart }, 200, { requestId });
});

export const DELETE = route<{ code: string; itemId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  const { code, itemId } = await params;
  const groupCart = await GroupCartRepository.removeItem({
    code,
    userId: auth.user.id,
    itemId: assertUuid(itemId, "group cart item"),
  });
  return apiSuccess({ groupCart }, 200, { requestId });
});
