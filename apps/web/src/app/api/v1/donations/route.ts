import { z } from "zod";
import { DonationRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseBody, route } from "@/server/route";

const Give = z.object({ amountPaise: z.number().int().min(1000).max(100000) });

export const GET = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  const summary = await DonationRepository.summary(auth.user.id);
  return apiSuccess(summary, 200, { requestId });
});

export const POST = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req);
  const body = await parseBody(req, Give);
  const donation = await DonationRepository.give({ userId: auth.user.id, amountPaise: body.amountPaise });
  return apiSuccess({ donation }, 201, { requestId });
});
