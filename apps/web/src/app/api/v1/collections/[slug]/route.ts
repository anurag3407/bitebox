import { DomainError } from "@startup/core";
import { CollectionRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { route } from "@/server/route";

export const GET = route<{ slug: string }>(async (_req, { params }, requestId) => {
  const collection = await CollectionRepository.findBySlug((await params).slug);
  if (!collection) throw new DomainError("NOT_FOUND", "Collection not found");
  return apiSuccess({ collection }, 200, { requestId });
});
