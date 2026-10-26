import { z } from "zod";
import { UserRole } from "@startup/contracts";
import { AuditRepository, BatchRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseBody, route } from "@/server/route";

const CreateZone = z.object({
  name: z.string().trim().min(2).max(120),
  cityId: z.string().uuid(),
  centerLatitude: z.number().min(-90).max(90),
  centerLongitude: z.number().min(-180).max(180),
  radiusMeters: z.number().int().min(200).max(20000).optional(),
  polygon: z.array(z.object({ latitude: z.number(), longitude: z.number() })).min(3).optional(),
});

function circlePolygon(lat: number, lng: number, radiusMeters: number) {
  const latDelta = radiusMeters / 111_320;
  const lngDelta = radiusMeters / (111_320 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  return Array.from({ length: 10 }, (_, i) => {
    const angle = (i / 10) * Math.PI * 2;
    return {
      latitude: Number((lat + Math.sin(angle) * latDelta).toFixed(6)),
      longitude: Number((lng + Math.cos(angle) * lngDelta).toFixed(6)),
    };
  });
}

export const GET = route(async (req, _ctx, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const [clusters, cities] = await Promise.all([BatchRepository.listClusters(), BatchRepository.listCities()]);
  const zones = await Promise.all(
    clusters.map(async (cluster) => ({
      ...cluster,
      dropPoints: (await BatchRepository.listDropPoints(cluster.id)).map((d) => ({
        id: d.id,
        name: d.name,
        latitude: d.latitude,
        longitude: d.longitude,
        captainFeePerBagPaise: d.captain_fee_per_bag_paise,
      })),
    }))
  );
  return apiSuccess({ zones, cities }, 200, { requestId });
});

export const POST = route(async (req, _ctx, requestId) => {
  const auth = await requireAuth(req, [UserRole.ADMIN]);
  const body = await parseBody(req, CreateZone);
  const polygon = body.polygon ?? circlePolygon(body.centerLatitude, body.centerLongitude, body.radiusMeters ?? 2000);
  const cluster = await BatchRepository.createCluster({
    cityId: body.cityId,
    name: body.name,
    polygonGeojson: polygon,
  });
  await AuditRepository.log({
    adminUserId: auth.user.id,
    action: "ZONE_CREATED",
    targetType: "cluster",
    targetId: cluster.id,
    details: { name: body.name, isCustomPolygon: Boolean(body.polygon), radiusMeters: body.radiusMeters },
  });
  return apiSuccess({ zone: { id: cluster.id, name: cluster.name } }, 201, { requestId });
});
