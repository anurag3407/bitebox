import { UserRole } from "@startup/contracts";
import { getDbPool } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { route } from "@/server/route";

export const GET = route(async (req, _ctx, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const res = await getDbPool().query(
    `SELECT r.id, r.name, r.phone, r.vehicle_type, r.is_online, r.last_ping_at,
            r.current_latitude, r.current_longitude,
            da.order_id AS active_order_id, da.status AS trip_status
       FROM riders r
       LEFT JOIN delivery_assignments da
         ON da.rider_id = r.id AND da.status IN ('ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROPOFF')
      WHERE r.is_approved
      ORDER BY r.is_online DESC, r.last_ping_at DESC NULLS LAST
      LIMIT 200`
  );
  return apiSuccess(
    res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      vehicleType: r.vehicle_type,
      isOnline: r.is_online,
      lastPingAt: r.last_ping_at?.toISOString(),
      location: r.current_latitude !== null ? { latitude: r.current_latitude, longitude: r.current_longitude } : undefined,
      activeOrderId: r.active_order_id ?? undefined,
      tripStatus: r.trip_status ?? undefined,
    })),
    200,
    { requestId }
  );
});
