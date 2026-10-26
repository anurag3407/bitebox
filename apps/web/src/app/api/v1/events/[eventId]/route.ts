import { DomainError } from "@startup/core";
import { DiningEventRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { assertUuid, route } from "@/server/route";

export const GET = route<{ eventId: string }>(async (req, { params }, requestId) => {
  const eventId = assertUuid((await params).eventId, "event");
  const event = await DiningEventRepository.findById(eventId);
  if (!event) throw new DomainError("NOT_FOUND", "Event not found");
  return apiSuccess({ event }, 200, { requestId });
});
