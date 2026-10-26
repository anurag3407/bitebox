import { CollectionRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { route } from "@/server/route";

export const GET = route(async (_req, _ctx, requestId) => {
  const collections = await CollectionRepository.list();
  return apiSuccess({ collections }, 200, { requestId });
});
