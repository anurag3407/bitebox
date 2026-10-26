import { z } from "zod";
import { SponsorshipRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { parseBody, route } from "@/server/route";

const RecordEvent = z.object({
  restaurantId: z.string().uuid(),
  eventType: z.enum(["IMPRESSION", "CLICK", "CONVERSION"]),
  source: z.enum(["SEARCH", "HOME_FEED", "COLLECTION", "CUISINE_RAIL"]).optional(),
  orderId: z.string().uuid().optional(),
  orderAmountPaise: z.number().int().min(0).optional(),
});

export const POST = route(async (req, _ctx, requestId) => {
  const body = await parseBody(req, RecordEvent);
  await SponsorshipRepository.recordEvent(body);
  return apiSuccess({ recorded: true }, 201, { requestId });
});
