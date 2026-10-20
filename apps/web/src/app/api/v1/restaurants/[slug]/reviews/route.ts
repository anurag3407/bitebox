import { DomainError } from "@startup/core";
import { RatingRepository, getDbPool } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { route } from "@/server/route";

export const GET = route<{ slug: string }>(async (_req, { params }, requestId) => {
  const { slug } = await params;
  const res = await getDbPool().query(`SELECT id FROM restaurants WHERE slug = $1 AND is_active`, [slug]);
  if (!res.rows[0]) throw new DomainError("NOT_FOUND", "Restaurant not found");
  return apiSuccess(await RatingRepository.listForRestaurant(res.rows[0].id), 200, { requestId });
});
