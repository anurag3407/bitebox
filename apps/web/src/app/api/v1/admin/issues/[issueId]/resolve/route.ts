import { ResolveOrderIssueSchema, UserRole } from "@startup/contracts";
import { OrderExperienceRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, parseBody, route } from "@/server/route";

export const POST = route<{ issueId: string }>(async (req, { params }, requestId) => {
  const { user } = await requireAuth(req, [UserRole.ADMIN]);
  const issueId = assertUuid((await params).issueId, "issue");
  const body = await parseBody(req, ResolveOrderIssueSchema);
  return apiSuccess(await OrderExperienceRepository.resolveIssue(issueId, user.id, body), 200, { requestId });
});
