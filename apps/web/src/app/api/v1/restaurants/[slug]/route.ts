import { DomainError } from "@startup/core";
import { RestaurantRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { CacheKeys, cached } from "@/server/cache";
import { enforceRateLimit } from "@/server/rate-limit";
import { route } from "@/server/route";

const SLUG_RE = /^[a-z0-9-]{1,80}$/;

export const GET = route<{ slug: string }>(async (req, { params }, requestId) => {
  await enforceRateLimit(req, "discovery");
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) throw new DomainError("NOT_FOUND", "Restaurant not found");
  const detail = await cached(CacheKeys.menu(slug), 30, () => RestaurantRepository.findBySlug(slug));
  if (!detail) throw new DomainError("NOT_FOUND", "Restaurant not found");
  return apiSuccess(detail, 200, { requestId, headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=60" } });
});
