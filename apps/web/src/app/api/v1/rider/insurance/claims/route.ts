import { z } from "zod";
import { RiderInsuranceRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth, requireRiderProfile } from "@/server/auth-guard";
import { parseBody, route } from "@/server/route";

const FileClaim = z.object({
  incidentType: z.enum(["ACCIDENT", "HOSPITALIZATION", "VEHICLE_DAMAGE", "OTHER"]),
  incidentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(20).max(2000),
  claimedPaise: z.number().int().min(10000).max(50000000),
});

export const POST = route(async (req, _ctx, requestId) => {
  const rider = await requireRiderProfile(await requireAuth(req));
  const body = await parseBody(req, FileClaim);
  const claim = await RiderInsuranceRepository.fileClaim({ riderId: rider.id, ...body });
  return apiSuccess({ claim }, 201, { requestId });
});
