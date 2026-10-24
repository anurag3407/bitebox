import { z } from "zod";
import { UserRole } from "@startup/contracts";
import { SurplusRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseBody, route } from "@/server/route";

const CreateCampaign = z.object({
  action: z.literal("CREATE_CAMPAIGN"),
  brandName: z.string().trim().min(2).max(80),
  clusterId: z.string().uuid(),
  targetAudience: z.enum(["CAMPUS", "TECH_PARK"]),
  bountyPerBoxPaise: z.number().int().nonnegative(),
  remainingUnits: z.number().int().positive(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

const AttachSampling = z.object({
  action: z.literal("ATTACH"),
  orderId: z.string().uuid(),
  clusterId: z.string().uuid(),
  units: z.number().int().min(1).max(5).optional(),
});

export const POST = route(async (req, _ctx, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const body = await parseBody(req, z.discriminatedUnion("action", [CreateCampaign, AttachSampling]));
  if (body.action === "CREATE_CAMPAIGN") {
    const campaign = await SurplusRepository.createCampaign({
      brandName: body.brandName,
      clusterId: body.clusterId,
      targetAudience: body.targetAudience,
      bountyPerBoxPaise: body.bountyPerBoxPaise,
      remainingUnits: body.remainingUnits,
      startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
    });
    return apiSuccess({ campaign }, 201, { requestId });
  }
  const attachment = await SurplusRepository.attachSampling({
    orderId: body.orderId,
    clusterId: body.clusterId,
    units: body.units,
  });
  return apiSuccess({ attachment }, attachment ? 201 : 200, { requestId });
});
