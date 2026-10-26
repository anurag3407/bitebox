import { AddGroupCartItemRequestSchema } from "@startup/contracts";
import { GroupCartRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseBody, route } from "@/server/route";

export const POST = route<{ code: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  await enforceRateLimit(req, "mutation", auth.user.id);
  const body = await parseBody(req, AddGroupCartItemRequestSchema);
  const groupCart = await GroupCartRepository.addItem({
    code: (await params).code,
    userId: auth.user.id,
    menuItemId: body.menuItemId,
    variantId: body.variantId,
    selectedOptionIds: body.selectedOptionIds,
    quantity: body.quantity,
    notes: body.notes,
  });
  return apiSuccess({ groupCart }, 201, { requestId });
});
