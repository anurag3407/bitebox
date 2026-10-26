import { CampusRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { route } from "@/server/route";

export const GET = route(async (_req, _ctx, requestId) => {
  const campuses = await CampusRepository.list();
  return apiSuccess({ campuses }, 200, { requestId });
});
