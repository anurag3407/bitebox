import { z } from "zod";
import { AddonRepository, getDbPool } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { StaffPermission } from "@/server/auth-guard";
import { authorizeRestaurant } from "@/server/merchant-catalog";
import { parseBody, route } from "@/server/route";

const CreateSku = z.object({
  clusterId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(80),
  pricePaise: z.number().int().positive(),
  cogsPaise: z.number().int().nonnegative(),
  stockCount: z.number().int().nonnegative(),
});

export const GET = route<{ restaurantId: string }>(async (req, { params }, requestId) => {
  const { restaurantId } = await authorizeRestaurant(req, params, StaffPermission.EDIT_MENU);
  const res = await getDbPool().query(
    `SELECT * FROM addon_skus WHERE kitchen_id = $1 ORDER BY is_active DESC, name ASC`,
    [restaurantId]
  );
  return apiSuccess({ addons: res.rows }, 200, { requestId });
});

export const POST = route<{ restaurantId: string }>(async (req, { params }, requestId) => {
  const { restaurantId } = await authorizeRestaurant(req, params, StaffPermission.EDIT_MENU);
  const body = await parseBody(req, CreateSku);
  const sku = await AddonRepository.createSku({ restaurantId, ...body });
  return apiSuccess({ addon: sku }, 201, { requestId });
});

export const PATCH = route<{ restaurantId: string }>(async (req, { params }, requestId) => {
  await authorizeRestaurant(req, params, StaffPermission.EDIT_MENU);
  const body = await parseBody(
    req,
    z.object({ addonSkuId: z.string().uuid(), stockCount: z.number().int().nonnegative() })
  );
  const sku = await AddonRepository.setStock(body.addonSkuId, body.stockCount);
  return apiSuccess({ addon: sku }, 200, { requestId });
});
