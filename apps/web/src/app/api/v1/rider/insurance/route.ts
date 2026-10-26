import { RiderInsuranceRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth, requireRiderProfile } from "@/server/auth-guard";
import { route } from "@/server/route";

export const GET = route(async (req, _ctx, requestId) => {
  const rider = await requireRiderProfile(await requireAuth(req));
  const overview = await RiderInsuranceRepository.overview(rider.id);
  return apiSuccess(overview, 200, { requestId });
});

export const POST = route(async (req, _ctx, requestId) => {
  const rider = await requireRiderProfile(await requireAuth(req));
  const policy = await RiderInsuranceRepository.enroll(rider.id);
  return apiSuccess({ policy }, 201, { requestId });
});
